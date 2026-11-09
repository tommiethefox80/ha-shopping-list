import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ShoppingList } from '../src/list.js';
import { Sender } from '../src/sender.js';
import { defaultProducts, Store } from '../src/store.js';
import { TescoDriver } from '../src/tesco/driver.js';
import { startMockTesco, type MockTesco } from './mockTesco.js';

const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
let mock: MockTesco;
let driver: TescoDriver;
let store: Store;
let list: ShoppingList;
let sender: Sender;

const waitForJob = async () => {
  for (let i = 0; i < 300 && sender.state.running; i++) await new Promise((r) => setTimeout(r, 100));
  return sender.state;
};

beforeAll(async () => {
  mock = await startMockTesco();
  const dir = mkdtempSync(join(tmpdir(), 'shopping-list-'));
  store = new Store(dir, defaultProducts);
  list = new ShoppingList(store);
  driver = new TescoDriver({ baseUrl: mock.url, dataDir: dir, headless: true, chromePath });
  sender = new Sender(store, driver, { min: 10, max: 20 });
});
afterAll(async () => {
  await driver.close();
  await mock.close();
});

describe('Send to Tesco against a mock tesco.com', () => {
  it('refuses to send while signed out and leaves items on the list', async () => {
    list.add({ text: '2 beans' });
    sender.start();
    const s = await waitForJob();
    expect(s.outcome).toBe('signed_out');
    expect(store.data.items[0].status).toBe('todo');
  });

  it('signs in through the viewer controls', async () => {
    await driver.openSignIn();
    await driver.type('tom@example.com');
    await driver.press('Tab');
    await driver.type('secret');
    await driver.press('Enter');
    await new Promise((r) => setTimeout(r, 500));
    expect(await driver.isSignedIn()).toBe(true);
    expect((await driver.screenshot()).length).toBeGreaterThan(1000);
  });

  it('adds defaults, asks about unknowns, flags unavailable and ticks off', async () => {
    list.add({ text: 'chopped tomatoes' });
    list.add({ text: 'houmous' });
    store.update((db) =>
      db.products.push({ ...db.products[0], id: 'gb', label: 'Green beans', aliases: [], tescoId: '999999999', usual: false }),
    );
    list.add({ text: 'green beans' });
    list.add({ text: 'beans' }); // merges with "2 beans" -> 3
    expect(store.data.items.find((i) => i.name === '2 beans' || i.name === 'beans')?.qty).toBe(3);

    sender.start();
    const s = await waitForJob();
    expect(s.outcome).toBe('completed');
    const by = (n: string) => store.data.items.find((i) => i.name === n)!;
    expect(by('beans').status).toBe('in_basket');
    expect(by('chopped tomatoes').status).toBe('in_basket');
    expect(by('houmous').status).toBe('needs_product');
    expect(by('houmous').candidates?.map((c) => c.tescoId)).toEqual(['111111111', '222222222']);
    expect(by('green beans').status).toBe('unavailable');
    expect(mock.basket.get('275205504')).toBe(3);
    expect(mock.basket.get('251825089')).toBe(1);
  });

  it('picking a product remembers it as the default and sends it next time', async () => {
    const h = store.data.items.find((i) => i.name === 'houmous')!;
    list.choose(h.id, h.candidates![1], true);
    expect(store.data.products.some((p) => p.tescoId === '222222222' && p.label === 'houmous')).toBe(true);
    sender.start();
    await waitForJob();
    expect(mock.basket.get('222222222')).toBe(1);
    expect(list.addUsuals().length).toBe(4);
  });

  it('stops cleanly when Tesco signs you out mid-way', async () => {
    mock.signOutEveryone();
    list.add({ text: 'milk' });
    sender.start();
    const s = await waitForJob();
    expect(s.outcome).toBe('signed_out');
    const milk = store.data.items.find((i) => i.name === 'Whole milk')!; // "milk" merged into the usual
    expect(milk.status).toBe('todo');
    expect(milk.qty).toBe(2);
  });

  it('search returns tiles with prices', async () => {
    const r = await driver.search('houmous');
    expect(r[0]).toMatchObject({ tescoId: '111111111', name: 'Tesco Houmous 200G', price: '£0.95', available: true });
  });
});
