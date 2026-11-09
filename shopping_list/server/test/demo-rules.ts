// Screenshots of the offer rule: product editor, list hint, send review sheet, sign-in viewer.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, devices } from 'playwright';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { defaultProducts, Store } from '../src/store.js';
import { TescoDriver } from '../src/tesco/driver.js';
import { startMockTesco } from './mockTesco.js';

const chromePath = '/usr/bin/google-chrome';
const out = process.argv[2] ?? '/tmp';
const mock = await startMockTesco();
const dir = mkdtempSync(join(tmpdir(), 'demo-'));
const cfg = { ...loadConfig(), dataDir: dir, baseUrl: mock.url, headless: true, minDelayMs: 50, maxDelayMs: 100, port: 8124,
  webDir: new URL('../../web/dist', import.meta.url).pathname };
const store = new Store(dir, defaultProducts);
const tesco = new TescoDriver({ baseUrl: mock.url, dataDir: dir, headless: true, chromePath });
const { app } = await buildApp(cfg, store, tesco);
await app.listen({ port: 8124, host: '127.0.0.1' });
const base = 'http://127.0.0.1:8124/';
const call = (m: string, p: string, b: unknown = {}) => fetch(base + 'api/' + p, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());

const nappies = store.data.products.find((p) => p.label === 'Nappies')!;
await call('PATCH', `products/${nappies.id}`, { tescoId: '333333333', tescoName: 'Fred & Flo Ultra Dry Nappies Size 6 30 Pack',
  offerSwaps: [{ tescoId: '288089822', tescoName: 'Pampers Baby-Dry Size 6 Nappies 33 Pack' }] });
for (const t of ['nappies', '2 beans', 'milk']) await call('POST', 'items', { text: t });

const browser = await chromium.launch({ executablePath: chromePath });
const page = await browser.newPage({ ...devices['iPhone 13'], colorScheme: 'dark' });
const shot = (n: string) => page.screenshot({ path: join(out, n + '.png') });

// sign-in viewer while the browser starts
await page.goto(base + '#tesco');
await page.getByRole('button', { name: 'Sign in to Tesco' }).click();
await page.waitForTimeout(400);
await shot('r0-viewer-starting');
await page.waitForTimeout(3000);
await shot('r1-viewer');
await tesco.fillSignIn('email', 'a@b.c'); await tesco.fillSignIn('password', 'x'); await page.waitForTimeout(500);

await page.goto(base + '#list');
await page.getByText('Shopping list').waitFor();
await shot('r2-list');
await page.getByRole('button', { name: /Send .* to Tesco/ }).click();
await page.getByRole('button', { name: /Send to Tesco basket/ }).waitFor({ timeout: 30000 });
await shot('r3-review');
await page.getByRole('button', { name: /Send to Tesco basket/ }).click();
for (let i = 0; i < 100; i++) { const s = await (await fetch(base + 'api/send')).json(); if (!s.running) break; await page.waitForTimeout(200); }

await page.goto(base + '#defaults');
await page.getByText('Nappies', { exact: true }).click();
await page.waitForTimeout(300);
await page.getByText('Rule: use instead when on offer').scrollIntoViewIfNeeded();
await shot('r4-rule-editor');
console.log('basket', [...mock.basket]);
await browser.close(); await tesco.close(); await app.close(); await mock.close();
