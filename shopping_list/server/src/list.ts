import type { Candidate, Item, Product } from './domain.js';
import { newId, now } from './domain.js';
import { clampQty, findProduct, normalize, parseItemText } from './matching.js';
import type { Store } from './store.js';

const OPEN: Item['status'][] = ['todo', 'needs_product', 'error', 'unavailable'];

export interface AddItemInput {
  text?: string;
  name?: string;
  qty?: number;
  ean?: string;
  productId?: string;
  source?: string;
}

/** Shopping-list rules, kept separate from HTTP so they can be unit tested. */
export class ShoppingList {
  constructor(private readonly store: Store) {}

  /** Adds an item, merging with an open item for the same thing ("beans" twice -> qty 2). */
  add(input: AddItemInput): Item {
    const parsed = input.text ? parseItemText(input.text) : { name: (input.name ?? '').trim(), qty: 1 };
    const qty = clampQty(input.qty ?? parsed.qty);
    const products = this.store.data.products;
    const explicit = input.productId ? products.find((p) => p.id === input.productId) : undefined;
    const name = parsed.name || explicit?.label || (input.ean ? `Barcode ${input.ean}` : '');
    if (!name) throw new Error('Item name is required');

    const product = explicit ?? findProduct(products, { name, ean: input.ean });
    return this.store.update((db) => {
      const existing = db.items.find(
        (i) =>
          OPEN.includes(i.status) &&
          ((product && findProduct(db.products, i)?.id === product.id) ||
            (!product && normalize(i.name) === normalize(name)) ||
            (input.ean && i.ean === input.ean)),
      );
      if (existing) {
        existing.qty = clampQty(existing.qty + qty);
        existing.status = 'todo';
        existing.updatedAt = now();
        return existing;
      }
      const t = now();
      const item: Item = {
        id: newId(), name, qty, ean: input.ean, productId: explicit?.id,
        status: 'todo', source: input.source, createdAt: t, updatedAt: t,
      };
      db.items.push(item);
      return item;
    });
  }

  addUsuals(productIds?: string[]): Item[] {
    const usuals = this.store.data.products.filter((p) => (productIds ? productIds.includes(p.id) : p.usual));
    return usuals.map((p) => this.add({ name: p.label, productId: p.id, qty: p.defaultQty, source: 'usuals' }));
  }

  /** Pick a product for an item. remember=true saves it as the default for that name. */
  choose(itemId: string, c: Candidate, remember: boolean): Item {
    return this.store.update((db) => {
      const item = db.items.find((i) => i.id === itemId);
      if (!item) throw new Error('Item not found');
      if (remember) {
        let product = db.products.find((p) => p.tescoId === c.tescoId);
        const t = now();
        if (!product) {
          product = {
            id: newId(), label: item.name.startsWith('Barcode ') ? c.name : item.name, aliases: [],
            tescoId: c.tescoId, tescoName: c.name, price: c.clubcardPrice ?? c.price, imageUrl: c.imageUrl,
            eans: [], defaultQty: 1, usual: false, createdAt: t, updatedAt: t,
          };
          db.products.push(product);
        } else if (![product.label, ...product.aliases].some((n) => normalize(n) === normalize(item.name)) && !item.name.startsWith('Barcode ')) {
          product.aliases.push(item.name);
          product.updatedAt = t;
        }
        if (item.ean && !product.eans.includes(item.ean)) product.eans.push(item.ean);
        item.productId = product.id;
        item.oneOffTescoId = undefined;
        item.oneOffTescoName = undefined;
      } else {
        item.oneOffTescoId = c.tescoId;
        item.oneOffTescoName = c.name;
      }
      if (item.name.startsWith('Barcode ')) item.name = c.name;
      item.status = 'todo';
      item.candidates = undefined;
      item.message = undefined;
      item.updatedAt = now();
      return item;
    });
  }

  update(itemId: string, changes: { name?: string; qty?: number; productId?: string | null; status?: 'todo' | 'ticked' }): Item {
    return this.store.update((db) => {
      const item = db.items.find((i) => i.id === itemId);
      if (!item) throw new Error('Item not found');
      if (changes.name !== undefined && changes.name.trim()) item.name = changes.name.trim();
      if (changes.qty !== undefined) item.qty = clampQty(changes.qty);
      if (changes.productId !== undefined) {
        item.productId = changes.productId ?? undefined;
        item.oneOffTescoId = undefined;
        item.oneOffTescoName = undefined;
      }
      if (changes.status === 'todo' || changes.status === 'ticked') {
        item.status = changes.status;
        item.message = undefined;
      }
      item.updatedAt = now();
      return item;
    });
  }

  remove(itemId: string) {
    this.store.update((db) => {
      db.items = db.items.filter((i) => i.id !== itemId);
    });
  }

  clearDone(): number {
    return this.store.update((db) => {
      const before = db.items.length;
      db.items = db.items.filter((i) => i.status !== 'in_basket' && i.status !== 'ticked');
      return before - db.items.length;
    });
  }

  /** What each open item will be sent as, for display. */
  resolve(item: Item): { tescoId?: string; tescoName?: string; productId?: string; swaps?: string[] } {
    if (item.oneOffTescoId) return { tescoId: item.oneOffTescoId, tescoName: item.oneOffTescoName };
    const p: Product | undefined = findProduct(this.store.data.products, item);
    return p
      ? { tescoId: p.tescoId, tescoName: p.tescoName, productId: p.id, swaps: p.offerSwaps?.map((s) => s.tescoName) }
      : {};
  }
}
