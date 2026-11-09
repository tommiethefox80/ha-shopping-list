import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId, now } from '../src/domain.js';
import { ShoppingList } from '../src/list.js';
import { decide } from '../src/rules.js';
import { Sender } from '../src/sender.js';
import { Store } from '../src/store.js';
import { TescoDriver } from '../src/tesco/driver.js';
import { CATALOGUE, startMockTesco, type MockTesco } from './mockTesco.js';

const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';
let mock: MockTesco;
let driver: TescoDriver;
let store: Store;
let list: ShoppingList;
let sender: Sender;
const PAMPERS = '288089822';
const FRED = '333333333';

const nappies = () => store.data.products.find((p) => p.label === 'Nappies')!;
const waitForJob = async () => {
  for (let i = 0; i < 300 && sender.state.running; i++) await new Promise((r) => setTimeout(r, 100));
  return sender.state;
};

beforeAll(async () => {
  mock = await startMockTesco();
  const dir = mkdtempSync(join(tmpdir(), 'shopping-list-rules-'));
  store = new Store(dir, () => [
    {
      id: newId(), label: 'Nappies', aliases: [], tescoId: FRED, tescoName: CATALOGUE[FRED].name, eans: [], defaultQty: 1,
      usual: false, createdAt: now(), updatedAt: now(), offerSwaps: [{ tescoId: PAMPERS, tescoName: CATALOGUE[PAMPERS].name }],
    },
  ]);
  list = new ShoppingList(store);
  driver = new TescoDriver({ baseUrl: mock.url, dataDir: dir, headless: true, chromePath });
  sender = new Sender(store, driver, { min: 10, max: 20 });
  await driver.openSignIn();
  await driver.type('a');
  await driver.press('Enter');
  await new Promise((r) => setTimeout(r, 500));
});
afterAll(async () => {
  await driver.close();
  await mock.close();
});

describe('"Pampers if on offer, otherwise Fred & Flo"', () => {
  it('reads the offer from the search tile', async () => {
    const c = await driver.offerFor(PAMPERS, CATALOGUE[PAMPERS].name);
    expect(c?.offer).toBe('£5.50 Half Price Clubcard Price');
    expect((await driver.offerFor(FRED, CATALOGUE[FRED].name))?.offer).toBeUndefined();
  });

  it('picks Pampers while on offer, and shows both options for review', async () => {
    const d = await decide(nappies(), driver, true);
    expect(d.tescoId).toBe(PAMPERS);
    expect(d.options.map((o) => [o.tescoId, o.isMain])).toEqual([[PAMPERS, false], [FRED, true]]);
  });

  it('falls back to Fred & Flo when the offer ends', async () => {
    const saved = CATALOGUE[PAMPERS].offer;
    delete CATALOGUE[PAMPERS].offer;
    expect((await decide(nappies(), driver)).tescoId).toBe(FRED);
    CATALOGUE[PAMPERS].offer = saved;
  });

  it('send applies the rule by itself', async () => {
    list.add({ text: 'nappies' });
    sender.start();
    await waitForJob();
    expect(mock.basket.get(PAMPERS)).toBe(1);
    expect(sender.state.log.some((l) => l.text.includes('is on offer'))).toBe(true);
  });

  it('a choice made in the review sheet overrides the rule', async () => {
    const item = list.add({ text: 'nappies' });
    sender.start(undefined, { [item.id]: FRED });
    await waitForJob();
    expect(mock.basket.get(FRED)).toBe(1);
    expect(mock.basket.get(PAMPERS)).toBe(1);
  });
});
