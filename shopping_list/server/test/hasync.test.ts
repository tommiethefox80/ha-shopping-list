import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HaSync } from '../src/hasync.js';
import { ShoppingList } from '../src/list.js';
import { defaultProducts, Store } from '../src/store.js';
import { startFakeHa } from './fakeHa.js';

const E = 'todo.shopping_list';
const until = async (cond: () => boolean, ms = 4000) => {
  const t = Date.now();
  while (!cond()) {
    if (Date.now() - t > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
};
const settle = () => new Promise((r) => setTimeout(r, 700));

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function setup(entities = [E]) {
  const ha = await startFakeHa();
  const store = new Store(mkdtempSync(join(tmpdir(), 'sl-ha-')), defaultProducts);
  const list = new ShoppingList(store);
  const sync = new HaSync(store, list, { url: ha.url, token: 'good', entities });
  cleanup = async () => {
    sync.stop();
    await ha.close();
  };
  const open = () => store.data.items.filter((i) => i.status === 'todo').map((i) => `${i.name}×${i.qty}`).sort();
  const haOpen = (e = E) => ha.items(e).filter((i) => i.status === 'needs_action').map((i) => i.summary).sort();
  return { ha, store, list, sync, open, haOpen };
}

describe('Home Assistant to-do sync', () => {
  it('pushes the list to HA, and takes Assist/HA additions into the list', async () => {
    const { ha, store, list, sync, open, haOpen } = await setup();
    list.add({ text: '2 beans' });
    sync.start();
    await until(() => haOpen().join() === 'beans ×2');
    ha.userAdd(E, 'bananas');
    await until(() => open().includes('bananas×1'));
    expect(store.data.items.find((i) => i.name === 'bananas')?.addedBy).toBe('Home Assistant');
    await settle();
    expect(haOpen()).toEqual(['bananas', 'beans ×2']);
  });

  it('ticks both ways', async () => {
    const { ha, store, list, sync, haOpen } = await setup();
    const beans = list.add({ text: 'beans' });
    list.add({ text: 'eggs' });
    sync.start();
    await until(() => haOpen().length === 2);
    ha.userUpdate(E, 'eggs', { status: 'completed' });
    await until(() => store.data.items.find((i) => i.name === 'eggs')?.status === 'ticked');
    list.update(beans.id, { status: 'ticked' });
    await until(() => ha.items(E).find((i) => i.summary === 'beans')?.status === 'completed');
  });

  it('quantity changes go both ways', async () => {
    const { ha, store, list, sync, haOpen } = await setup();
    const beans = list.add({ text: 'beans' });
    sync.start();
    await until(() => haOpen().join() === 'beans');
    list.update(beans.id, { qty: 3 });
    await until(() => haOpen().join() === 'beans ×3');
    ha.userUpdate(E, 'beans ×3', { summary: 'beans x5' });
    await until(() => store.data.items[0].qty === 5);
    await until(() => haOpen().join() === 'beans ×5');
  });

  it('removals go both ways', async () => {
    const { ha, store, list, sync, haOpen } = await setup();
    const beans = list.add({ text: 'beans' });
    list.add({ text: 'eggs' });
    sync.start();
    await until(() => haOpen().length === 2);
    ha.userRemove(E, 'eggs');
    await until(() => !store.data.items.some((i) => i.name === 'eggs'));
    list.remove(beans.id);
    await until(() => haOpen().length === 0);
  });

  it('"milk" from Assist merges into Whole milk instead of duplicating', async () => {
    const { ha, list, sync, open, haOpen } = await setup();
    list.addUsuals(undefined, [list['store'].data.products[0].id]);
    sync.start();
    await until(() => haOpen().join() === 'Whole milk');
    ha.userAdd(E, 'milk');
    await until(() => open().join() === 'Whole milk×2');
    await until(() => haOpen().join() === 'Whole milk ×2');
  });

  it('keeps Alexa and the HA shopping list in step with each other through the app', async () => {
    const A = 'todo.alexa_shopping_list';
    const { ha, sync, open, haOpen } = await setup([E, A]);
    sync.start();
    await until(() => sync.connected);
    ha.userAdd(A, 'dishwasher tablets');
    await until(() => open().includes('dishwasher tablets×1'));
    await until(() => haOpen(E).includes('dishwasher tablets'));
  });

  it('settles: no endless back-and-forth', async () => {
    const { ha, list, sync } = await setup();
    list.add({ text: 'beans' });
    list.add({ text: 'eggs' });
    sync.start();
    await settle();
    const n = ha.calls.length;
    await settle();
    expect(ha.calls.length).toBe(n);
  });

  it('stops trying with a bad token', async () => {
    const ha = await startFakeHa('right');
    const store = new Store(mkdtempSync(join(tmpdir(), 'sl-ha-')), defaultProducts);
    const sync = new HaSync(store, new ShoppingList(store), { url: ha.url, token: 'wrong', entities: [E] });
    cleanup = async () => {
      sync.stop();
      await ha.close();
    };
    sync.start();
    await until(() => !!sync.lastError);
    expect(sync.status()).toMatchObject({ connected: false, error: 'Home Assistant refused the access token' });
  });
});
