import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ShoppingList } from '../src/list.js';
import { defaultProducts, Store } from '../src/store.js';

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

  it('ticks, unticks and clears done items; a ticked item is not merged into', () => {
    const { store, list } = fresh();
    const a = list.add({ text: 'beans' });
    list.update(a.id, { status: 'ticked' });
    const b = list.add({ text: 'beans' });
    expect(b.id).not.toBe(a.id);
    expect(list.clearDone()).toBe(1);
    expect(store.data.items.map((i) => i.id)).toEqual([b.id]);
  });
});

describe('upgrade from 1.x (Tesco version)', () => {
  it('keeps list and products, drops Tesco fields, maps statuses', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sl-mig-'));
    writeFileSync(join(dir, 'shopping-list.json'), JSON.stringify({
      products: [{ id: 'p1', label: 'Beans', aliases: ['baked beans'], tescoId: '275205504', tescoName: 'Branston Baked Beans 410G',
        eans: [], defaultQty: 1, usual: true, offerSwaps: [{ tescoId: '1', tescoName: 'x' }], createdAt: 'a', updatedAt: 'a' }],
      items: [
        { id: 'i1', name: 'beans', qty: 2, status: 'in_basket', addedAt: 't', createdAt: 'a', updatedAt: 'a' },
        { id: 'i2', name: 'houmous', qty: 1, status: 'needs_product', candidates: [{}], createdAt: 'a', updatedAt: 'a' },
        { id: 'i3', name: 'bread', qty: 1, status: 'unavailable', oneOffTescoId: '9', createdAt: 'a', updatedAt: 'a' },
      ],
    }));
    const store = new Store(dir);
    expect(store.data.products[0]).toMatchObject({ label: 'Beans', detail: 'Branston Baked Beans 410G', usual: true });
    expect(store.data.products[0]).not.toHaveProperty('tescoId');
    expect(store.data.items.map((i) => i.status)).toEqual(['ticked', 'todo', 'todo']);
    expect(store.data.items[1]).not.toHaveProperty('candidates');
  });
});
