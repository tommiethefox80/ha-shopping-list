import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type BrowserContext, type Page, type Response } from 'playwright';
import type { Candidate } from '../domain.js';

export class SessionExpiredError extends Error {
  constructor() {
    super('Signed out of Tesco');
  }
}

export interface AddResult {
  ok: boolean;
  reason?: 'unavailable' | 'not_found' | 'error';
  message?: string;
  productName?: string;
}

export interface TescoClient {
  isSignedIn(): Promise<boolean>;
  search(query: string, limit?: number): Promise<Candidate[]>;
  product(tescoId: string): Promise<Candidate | null>;
  addToBasket(tescoId: string, qty: number): Promise<AddResult>;
  /** Remote sign-in viewer */
  openSignIn(): Promise<void>;
  screenshot(): Promise<Buffer>;
  click(xRatio: number, yRatio: number): Promise<void>;
  type(text: string): Promise<void>;
  press(key: string): Promise<void>;
  close(): Promise<void>;
}

export interface DriverOptions {
  baseUrl: string;
  dataDir: string;
  headless: boolean;
  chromePath?: string;
}

/** Serialises browser work so a send job and the sign-in viewer never fight over the page. */
class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.tail.then(fn, fn);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

const VIEWPORT = { width: 1000, height: 900 };

/**
 * Drives tesco.com in a persistent Chromium profile, so a sign-in done once through the
 * viewer is reused by every later send until Tesco expires it.
 *
 * Selectors are based on the live site (Nov 2026):
 *  - search results: li[data-testid=<productId>] containing a[href*="/products/<id>"]
 *  - add button:     button[aria-label^="add 1 <product name>"]
 *  - signed in:      a "Sign out" link in the header
 *  - basket updates: POST /bff (GraphQL)
 */
export class TescoDriver implements TescoClient {
  private ctx?: BrowserContext;
  private page?: Page;
  private readonly mutex = new Mutex();
  private cookiesChecked = false;
  private readonly origin: string;

  constructor(private readonly opts: DriverOptions) {
    this.origin = new URL(opts.baseUrl).origin;
  }

  private async getPage(): Promise<Page> {
    if (!this.ctx) {
      const profile = join(this.opts.dataDir, 'browser-profile');
      // A container restart leaves Chromium's single-instance locks behind; clear them.
      for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
        rmSync(join(profile, f), { force: true });
      }
      this.ctx = await chromium.launchPersistentContext(profile, {
        headless: this.opts.headless,
        executablePath: this.opts.chromePath,
        viewport: VIEWPORT,
        locale: 'en-GB',
        timezoneId: 'Europe/London',
        args: ['--disable-blink-features=AutomationControlled', '--no-first-run', '--disable-dev-shm-usage'],
      });
      this.ctx.on('close', () => {
        this.ctx = undefined;
        this.page = undefined;
      });
    }
    if (!this.page || this.page.isClosed()) {
      this.page = this.ctx.pages()[0] ?? (await this.ctx.newPage());
    }
    return this.page;
  }

  private isAuthUrl(url: string): boolean {
    try {
      const p = new URL(url).pathname;
      return p.includes('/account/auth/') || /\/login(\/|$)/.test(p);
    } catch {
      return false;
    }
  }

  private async goto(path: string): Promise<Page> {
    const page = await this.getPage();
    await page.goto(this.opts.baseUrl + path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await this.dismissCookies(page);
    return page;
  }

  /** Decline non-essential cookies if the consent banner shows. */
  private async dismissCookies(page: Page) {
    const reject = page.locator('#onetrust-reject-all-handler');
    try {
      if (!this.cookiesChecked) {
        this.cookiesChecked = true;
        await reject.waitFor({ state: 'visible', timeout: 3000 });
      }
      if ((await reject.count()) && (await reject.isVisible())) await reject.click();
    } catch {
      /* no banner */
    }
  }

  isSignedIn(): Promise<boolean> {
    return this.mutex.run(async () => {
      const page = await this.goto('/groceries/en-GB/trolley');
      if (this.isAuthUrl(page.url())) return false;
      return this.hasSignOut(page);
    });
  }

  private async hasSignOut(page: Page): Promise<boolean> {
    const probe = () =>
      [...document.querySelectorAll('a,button')].map((e) => (e.textContent ?? '').trim().toLowerCase());
    await page
      .waitForFunction(
        () => [...document.querySelectorAll('a,button')].some((e) => /^(sign out|sign in)$/i.test((e.textContent ?? '').trim())),
        null,
        { timeout: 15_000 },
      )
      .catch(() => undefined);
    const labels = await page.evaluate(probe);
    return labels.includes('sign out');
  }

  search(query: string, limit = 8): Promise<Candidate[]> {
    return this.mutex.run(async () => {
      const page = await this.goto(`/groceries/en-GB/search?query=${encodeURIComponent(query)}`);
      // Wait for either product tiles or Tesco's "no results" message.
      const found = await page
        .waitForFunction(
          () =>
            document.querySelector('li[data-testid] a[href*="/products/"]')
              ? 'tiles'
              : /no results|didn.t find|couldn.t find|0 results|no products/i.test(document.querySelector('main')?.textContent ?? '')
                ? 'none'
                : null,
          null,
          { timeout: 15_000 },
        )
        .then((h) => h.jsonValue())
        .catch(() => 'none');
      if (found !== 'tiles') return [];
      return page.evaluate(scrapeTiles, limit);
    });
  }

  product(tescoId: string): Promise<Candidate | null> {
    return this.mutex.run(async () => {
      const page = await this.goto(`/groceries/en-GB/products/${tescoId}`);
      const add = page.locator('button[aria-label^="add 1" i]').first();
      await add.waitFor({ timeout: 10_000 }).catch(() => undefined);
      const title = (await page.title()).replace(/\s*-\s*Tesco Groceries\s*$/i, '').trim();
      const label = (await add.getAttribute('aria-label').catch(() => null))?.replace(/^add 1\s+/i, '');
      const name = label || title;
      if (!name || /not found/i.test(name)) return null;
      const info = await page.evaluate(() => {
        const text = document.querySelector('main')?.textContent ?? document.body.textContent ?? '';
        const og = document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? undefined;
        return { price: text.match(/£\d+\.\d{2}/)?.[0], imageUrl: og };
      });
      return { tescoId, name, price: info.price, imageUrl: info.imageUrl, available: !!label };
    });
  }

  addToBasket(tescoId: string, qty: number): Promise<AddResult> {
    return this.mutex.run(async () => {
      const page = await this.goto(`/groceries/en-GB/products/${tescoId}`);
      if (this.isAuthUrl(page.url())) throw new SessionExpiredError();

      const add = page.locator('button[aria-label^="add 1" i]').first();
      try {
        await add.waitFor({ state: 'visible', timeout: 15_000 });
      } catch {
        const text = (await page.locator('body').innerText().catch(() => '')).toLowerCase();
        if (/currently unavailable|out of stock|not available|unavailable/.test(text)) {
          return { ok: false, reason: 'unavailable', message: 'Unavailable at Tesco right now' };
        }
        if (/page not found|can.t find|no longer available/.test(text)) {
          return { ok: false, reason: 'not_found', message: 'Product not found on Tesco' };
        }
        return { ok: false, reason: 'error', message: 'Could not find the Add button' };
      }
      if (!(await this.hasSignOut(page))) throw new SessionExpiredError();
      const productName = (await add.getAttribute('aria-label'))?.replace(/^add 1\s+/i, '');

      for (let i = 0; i < qty; i++) {
        const update = page
          .waitForResponse((r) => this.isBasketUpdate(r), { timeout: 15_000 })
          .catch(() => null);
        await add.click();
        const res = await update;
        if (this.isAuthUrl(page.url())) throw new SessionExpiredError();
        if (res && (res.status() === 401 || res.status() === 403)) throw new SessionExpiredError();
        if (res && res.status() >= 400) {
          return { ok: false, reason: 'error', productName, message: `Tesco returned ${res.status()} (${i} of ${qty} added)` };
        }
        if (!res) {
          // No basket call seen: fall back to checking the page shows the item in the basket.
          const inBasket = await page.locator('button[aria-label^="remove 1" i]').first().isVisible().catch(() => false);
          if (!inBasket) {
            return { ok: false, reason: 'error', productName, message: `Tesco didn't confirm the add (${i} of ${qty} added)` };
          }
        }
        await page.waitForTimeout(700);
      }
      return { ok: true, productName };
    });
  }

  private isBasketUpdate(r: Response): boolean {
    const req = r.request();
    if (req.method() !== 'POST' || !r.url().startsWith(this.origin)) return false;
    const path = new URL(r.url()).pathname;
    if (path === '/bff' || path.endsWith('/bff')) {
      const body = (req.postData() ?? '').toLowerCase();
      return /basket|trolley|mutation/.test(body);
    }
    return /trolley|basket/.test(path);
  }

  // ---------- Remote sign-in viewer ----------

  openSignIn(): Promise<void> {
    return this.mutex.run(async () => {
      const page = await this.goto('/groceries/en-GB/trolley');
      if (!this.isAuthUrl(page.url()) && !(await this.hasSignOut(page))) {
        const signIn = page.locator('a,button').filter({ hasText: /^\s*sign in\s*$/i }).first();
        if (await signIn.count()) await signIn.click().catch(() => undefined);
      }
    });
  }

  /** Not mutex-guarded on purpose: lets you watch a send job live. */
  async screenshot(): Promise<Buffer> {
    const page = await this.getPage();
    return page.screenshot({ type: 'jpeg', quality: 60, timeout: 10_000 });
  }

  click(xRatio: number, yRatio: number): Promise<void> {
    return this.mutex.run(async () => {
      const page = await this.getPage();
      const x = Math.round(Math.min(1, Math.max(0, xRatio)) * VIEWPORT.width);
      const y = Math.round(Math.min(1, Math.max(0, yRatio)) * VIEWPORT.height);
      await page.mouse.click(x, y);
    });
  }

  type(text: string): Promise<void> {
    return this.mutex.run(async () => {
      const page = await this.getPage();
      await page.keyboard.type(text, { delay: 40 });
    });
  }

  press(key: string): Promise<void> {
    const allowed = new Set(['Enter', 'Tab', 'Backspace', 'Escape', 'ArrowDown', 'ArrowUp']);
    if (!allowed.has(key)) return Promise.resolve();
    return this.mutex.run(async () => {
      const page = await this.getPage();
      await page.keyboard.press(key);
    });
  }

  async close(): Promise<void> {
    await this.ctx?.close().catch(() => undefined);
  }
}

/** Runs in the page: read product tiles from a search results page. */
function scrapeTiles(limit: number): Candidate[] {
  const out = new Map<string, Candidate>();
  for (const li of Array.from(document.querySelectorAll('li[data-testid]'))) {
    const a = li.querySelector('a[href*="/products/"]') as HTMLAnchorElement | null;
    const id = a?.href.match(/\/products\/(\d+)/)?.[1];
    if (!a || !id || out.has(id)) continue;
    const named = Array.from(li.querySelectorAll('a[href*="/products/"]'))
      .map((x) => (x.textContent ?? '').trim())
      .find(Boolean);
    const text = (li as HTMLElement).innerText ?? li.textContent ?? '';
    const img = li.querySelector('img') as HTMLImageElement | null;
    const club = text.match(/(£\d+\.\d{2})[^\n£]*Clubcard Price/i)?.[1];
    const prices = text.match(/£\d+\.\d{2}/g) ?? [];
    out.set(id, {
      tescoId: id,
      name: named ?? id,
      price: prices.find((p) => p !== club) ?? prices[0],
      clubcardPrice: club,
      imageUrl: img?.src || undefined,
      available:
        li.getAttribute('data-auto-available') !== 'false' && !!li.querySelector('button[aria-label^="add 1" i]'),
    });
    if (out.size >= limit) break;
  }
  return [...out.values()];
}
