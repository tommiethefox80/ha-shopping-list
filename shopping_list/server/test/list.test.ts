import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { guessCategory } from '../src/categories.js';
import { ShoppingList } from '../src/list.js';
import { defaultProducts, Store } from '../src/store.js';
import { dueSuggestions } from '../src/suggestions.js';

const fresh = () => {
  const store = new Store(mkdtempSync(join(tmpdir(), 'sl-')), defaultProducts);
  return { store, list: new ShoppingList(store) };
};

describe('shopping list', () => {
  it('merges the same thing and keeps quantities', () => {
    const { store, list } = fresh();
    list.add({ text: '2 beans' });
    list.add({ text: 'baked beans' });
    list.add({ text: 'houmous' });
    list.add({ text: 'Houmous' });
    expect(store.data.items.map((i) => [i.name, i.qty])).toEqual([['beans', 3], ['houmous', 2]]);
  });

  it('adds usuals, merging with what is already on the list', () => {
    const { store, list } = fresh();
    list.add({ text: 'milk' });
    list.addUsuals();
    expect(store.data.items.length).toBe(4);
    expect(store.data.items.find((i) => i.name === 'milk')?.qty).toBe(2);
  });

  it('keeps separate lists separate', () => {
    const { store, list } = fresh();
    const aldi = list.createList('Aldi');
    list.add({ text: 'beans' });
    list.add({ text: 'beans', listId: aldi.id });
    expect(store.data.items.map((i) => i.qty)).toEqual([1, 1]);
    expect(list.clearDone(aldi.id)).toBe(0);
    expect(() => list.deleteList(store.data.lists[0].id)).not.toThrow();
    expect(() => list.deleteList(aldi.id)).toThrow(/only list/);
  });

  it('ticks, unticks and clears done; ticking records a purchase, unticking forgets it', () => {
    const { store, list } = fresh();
    const a = list.add({ text: 'beans' });
    list.update(a.id, { status: 'ticked' });
    expect(store.data.purchases).toHaveLength(1);
    list.update(a.id, { status: 'todo' });
    expect(store.data.purchases).toHaveLength(0);
    list.update(a.id, { status: 'ticked' });
    const b = list.add({ text: 'beans' });
    expect(b.id).not.toBe(a.id);
    expect(list.clearDone()).toBe(1);
  });

  it('logs who did what', () => {
    const { store, list } = fresh();
    const i = list.add({ text: '2 nappies' }, 'Sarah');
    list.update(i.id, { status: 'ticked' }, 'Tom');
    expect(store.data.activity.map((a) => `${a.who}: ${a.text}`)).toEqual(['Sarah: added 2 × nappies', 'Tom: got nappies']);
  });
});

describe('aisles', () => {
  it('guesses common UK grocery aisles', () => {
    expect(guessCategory('bananas')).toBe('fruit-veg');
    expect(guessCategory('frozen peas')).toBe('frozen');
    expect(guessCategory('Branston Baked Beans 410g')).toBe('cupboard');
    expect(guessCategory('green beans')).toBe('fruit-veg');
    expect(guessCategory('coconut milk')).toBe('world');
    expect(guessCategory('peanut butter')).toBe('cupboard');
    expect(guessCategory('toilet roll')).toBe('household');
    expect(guessCategory('cat food')).toBe('pets');
    expect(guessCategory('size 6 nappies')).toBe('baby');
    expect(guessCategory('hot chilli powder')).toBe('cupboard');
    expect(guessCategory('red chilli')).toBe('fruit-veg');
    expect(guessCategory('zorbleflax')).toBeUndefined();
  });

  it('uses product names, and learns when you move something', () => {
    const { list } = fresh();
    const milk = list.add({ text: 'milk' });
    expect(list.resolve(milk).categoryId).toBe('dairy');
    const h = list.add({ text: 'houmous' });
    expect(list.resolve(h).categoryId).toBe('chilled');
    list.update(h.id, { categoryId: 'world' });
    list.update(h.id, { status: 'ticked' });
    const again = list.add({ text: 'Houmous' });
    expect(list.resolve(again).categoryId).toBe('world');
    const odd = list.add({ text: 'zorbleflax' });
    expect(list.resolve(odd).categoryId).toBe('other');
  });

  it('remembers prices per product or name', () => {
    const { list } = fresh();
    const b = list.add({ text: 'beans' });
    list.update(b.id, { price: 150 });
    list.update(b.id, { status: 'ticked' });
    expect(list.resolve(list.add({ text: 'baked beans' })).price).toBe(150);
    const h = list.add({ text: 'houmous' });
    list.update(h.id, { price: 95 });
    expect(list.resolve(h).price).toBe(95);
  });

  it('aisle order keeps every aisle exactly once', () => {
    const { store, list } = fresh();
    const id = store.data.lists[0].id;
    const l = list.updateList(id, { aisleOrder: ['frozen', 'bakery', 'nope'] });
    expect(l.aisleOrder.slice(0, 2)).toEqual(['frozen', 'bakery']);
    expect(new Set(l.aisleOrder).size).toBe(store.data.categories.length);
  });
});

describe('suggestions', () => {
  const day = 86_400_000;
  it('suggests things that are due, not things already on the list', () => {
    const { store, list } = fresh();
    const t0 = Date.parse('2026-10-01T10:00:00Z');
    store.update((db) => {
      for (const d of [0, 7, 14, 21]) db.purchases.push({ key: 'n:bananas', name: 'bananas', qty: 1, at: new Date(t0 + d * day).toISOString() });
      for (const d of [0, 30, 60]) db.purchases.push({ key: 'n:shampoo', name: 'shampoo', qty: 1, at: new Date(t0 + d * day).toISOString() });
      db.purchases.push({ key: 'n:cake', name: 'cake', qty: 1, at: new Date(t0).toISOString() });
    });
    const listId = store.data.lists[0].id;
    const at = t0 + 28 * day;
    expect(dueSuggestions(store.data, listId, at).map((s) => [s.name, s.everyDays, s.daysSince])).toEqual([['bananas', 7, 7]]);
    list.add({ text: 'bananas' });
    expect(dueSuggestions(store.data, listId, at)).toEqual([]);
  });
});

describe('upgrade from earlier versions', () => {
  it('1.x (Tesco) data: keeps list and products, drops Tesco fields, maps statuses, one list', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sl-mig-'));
    writeFileSync(join(dir, 'shopping-list.json'), JSON.stringify({
      products: [{ id: 'p1', label: 'Beans', aliases: ['baked beans'], tescoId: '275205504', tescoName: 'Branston Baked Beans 410G',
        eans: [], defaultQty: 1, usual: true, offerSwaps: [{ tescoId: '1', tescoName: 'x' }], createdAt: 'a', updatedAt: 'a' }],
      items: [
        { id: 'i1', name: 'beans', qty: 2, status: 'in_basket', addedAt: 't', createdAt: 'a', updatedAt: 'a' },
        { id: 'i2', name: 'houmous', qty: 1, status: 'needs_product', candidates: [{}], createdAt: 'a', updatedAt: 'a' },
      ],
    }));
    const store = new Store(dir);
    expect(store.data.version).toBe(3);
    expect(store.data.lists).toHaveLength(1);
    expect(store.data.products[0]).toMatchObject({ label: 'Beans', detail: 'Branston Baked Beans 410G', usual: true });
    expect(store.data.products[0]).not.toHaveProperty('tescoId');
    expect(store.data.items.map((i) => [i.status, i.listId])).toEqual([['ticked', store.data.lists[0].id], ['todo', store.data.lists[0].id]]);
    expect(store.data.categories.length).toBeGreaterThan(10);
  });

  it('v3 data loads unchanged', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sl-v3-'));
    const a = new Store(dir, defaultProducts);
    new ShoppingList(a).add({ text: 'beans' });
    const b = new Store(dir);
    expect(b.data.items).toHaveLength(1);
    expect(b.data.lists[0].id).toBe(a.data.lists[0].id);
  });
});
