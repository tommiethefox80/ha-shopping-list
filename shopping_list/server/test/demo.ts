// Runs the whole add-on against the mock Tesco and screenshots the UI on a phone-sized screen.
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
const cfg = { ...loadConfig(), dataDir: dir, baseUrl: mock.url, headless: true, minDelayMs: 50, maxDelayMs: 100, port: 8123,
  webDir: new URL('../../web/dist', import.meta.url).pathname };
const store = new Store(dir, defaultProducts);
const tesco = new TescoDriver({ baseUrl: mock.url, dataDir: dir, headless: true, chromePath });
const { app } = await buildApp(cfg, store, tesco);
await app.listen({ port: 8123, host: '127.0.0.1' });
const base = 'http://127.0.0.1:8123/';
const post = (p: string, b: unknown = {}) => fetch(base + 'api/' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((r) => r.json());

const browser = await chromium.launch({ executablePath: chromePath });
const page = await browser.newPage({ ...devices['iPhone 13'], colorScheme: 'light' });
const shot = (n: string) => page.screenshot({ path: join(out, n + '.png') });

// List with a mix of things
await post('usuals/add', { productIds: [store.data.products[0].id, store.data.products[3].id] });
for (const t of ['2 beans', 'chopped tomatoes', 'houmous', 'bananas']) await post('items', { text: t });
await page.goto(base);
await page.getByText('Shopping list').waitFor();
await shot('1-list');

// Send while signed out -> prompt
await post('send');
await new Promise((r) => setTimeout(r, 3000));
await page.reload();
await page.getByText('Shopping list').waitFor();
await shot('2-signed-out');

// Sign in via viewer page
await page.goto(base + '#tesco');
await page.getByRole('button', { name: 'Sign in to Tesco' }).click();
await new Promise((r) => setTimeout(r, 2500));
await shot('3-tesco-viewer');
await tesco.type('tom@example.com'); await tesco.press('Tab'); await tesco.type('x'); await tesco.press('Enter');
await new Promise((r) => setTimeout(r, 800));

// Send for real
await post('send');
for (let i = 0; i < 100; i++) { const s = await (await fetch(base + 'api/send')).json(); if (!s.running) break; await new Promise((r) => setTimeout(r, 200)); }
await page.goto(base + '#list');
await page.getByText('Shopping list').waitFor();
await page.getByRole('button', { name: /Done \(/ }).click().catch(() => {});
await shot('4-after-send');

// Pick a product for houmous
await page.getByText('houmous', { exact: true }).click();
await new Promise((r) => setTimeout(r, 500));
await shot('5-pick-product');
await page.keyboard.press('Escape');

await page.goto(base + '#defaults');
await page.getByRole('heading', { name: 'Products' }).waitFor();
await shot('6-products');
console.log('basket', [...mock.basket]);
await browser.close(); await tesco.close(); await app.close(); await mock.close();
