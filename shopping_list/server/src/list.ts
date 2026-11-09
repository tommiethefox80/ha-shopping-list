import { DEFAULT_CATEGORIES, guessCategory } from './categories.js';
import type { Category, Item, Product, ShopList } from './domain.js';
import { newId, now } from './domain.js';
import { clampQty, findProduct, normalize, parseItemText } from './matching.js';
import type { Store } from './store.js';
import { itemKey } from './suggestions.js';

export interface AddItemInput {
  text?: string;
  name?: string;
  qty?: number;
  ean?: string;
  productId?: string;
  listId?: string;
  note?: string;
  source?: string;
}

export interface ItemChanges {
  name?: string;
  qty?: number;
  productId?: string | null;
  status?: 'todo' | 'ticked';
  categoryId?: string;
  note?: string | null;
  /** Price per unit in pence; remembered for next time. null clears it. */
  price?: number | null;
  listId?: string;
}

const MAX_PURCHASES = 5000;
const MAX_ACTIVITY = 300;

/** Shopping-list rules, kept separate from HTTP so they can be unit tested. */
export class ShoppingList {
  constructor(private readonly store: Store) {}

  // ---------- lists ----------

  defaultListId(): string {
    return this.store.data.lists[0].id;
  }

  private listIdOr(listId?: string): string {
    return listId && this.store.data.lists.some((l) => l.id === listId) ? listId : this.defaultListId();
  }

  createList(name: string): ShopList {
    const n = name.trim();
    if (!n) throw new Error('A name is required');
    const list: ShopList = { id: newId(), name: n, aisleOrder: this.store.data.categories.map((c) => c.id), createdAt: now() };
    this.store.update((db) => db.lists.push(list));
    return list;
  }

  updateList(id: string, changes: { name?: string; aisleOrder?: string[] }): ShopList {
    return this.store.update((db) => {
      const list = db.lists.find((l) => l.id === id);
      if (!list) throw new Error('List not found');
      if (changes.name?.trim()) list.name = changes.name.trim();
      if (changes.aisleOrder) {
        const known = new Set(db.categories.map((c) => c.id));
        const order = changes.aisleOrder.filter((c) => known.has(c));
        list.aisleOrder = [...new Set([...order, ...db.categories.map((c) => c.id)])];
      }
      return list;
    });
  }

  deleteList(id: string) {
    this.store.update((db) => {
      if (db.lists.length <= 1) throw new Error("You can't delete the only list");
      db.lists = db.lists.filter((l) => l.id !== id);
      db.items = db.items.filter((i) => i.listId !== id);
    });
  }

  // ---------- categories ----------

  addCategory(name: string, emoji = '🛒'): Category {
    const n = name.trim();
    if (!n) throw new Error('A name is required');
    const cat: Category = { id: newId(), name: n, emoji: emoji || '🛒' };
    this.store.update((db) => {
      db.categories.push(cat);
      for (const l of db.lists) l.aisleOrder.push(cat.id);
    });
    return cat;
  }

  updateCategory(id: string, changes: { name?: string; emoji?: string }): Category {
    return this.store.update((db) => {
      const c = db.categories.find((x) => x.id === id);
      if (!c) throw new Error('Aisle not found');
      if (changes.name?.trim()) c.name = changes.name.trim();
      if (changes.emoji) c.emoji = changes.emoji;
      return c;
    });
  }

  deleteCategory(id: string) {
    if (id === 'other') throw new Error('"Other" is always kept');
    this.store.update((db) => {
      db.categories = db.categories.filter((c) => c.id !== id);
      for (const l of db.lists) l.aisleOrder = l.aisleOrder.filter((c) => c !== id);
      for (const p of db.products) if (p.categoryId === id) p.categoryId = undefined;
      for (const i of db.items) if (i.categoryId === id) i.categoryId = undefined;
      for (const m of Object.values(db.memory)) if (m.categoryId === id) m.categoryId = undefined;
    });
  }

  // ---------- items ----------

  /** Adds an item, merging with an open item for the same thing on that list ("beans" twice -> qty 2). */
  add(input: AddItemInput, who?: string): Item {
    const parsed = input.text ? parseItemText(input.text) : { name: (input.name ?? '').trim(), qty: 1 };
    const qty = clampQty(input.qty ?? parsed.qty);
    const listId = this.listIdOr(input.listId);
    const products = this.store.data.products;
    const explicit = input.productId ? products.find((p) => p.id === input.productId) : undefined;
    const name = parsed.name || explicit?.label || (input.ean ? `Barcode ${input.ean}` : '');
    if (!name) throw new Error('Item name is required');

    const product = explicit ?? findProduct(products, { name, ean: input.ean });
    return this.store.update((db) => {
      const existing = db.items.find(
        (i) =>
          i.listId === listId &&
          i.status === 'todo' &&
          ((product && findProduct(db.products, i)?.id === product.id) ||
            (!product && normalize(i.name) === normalize(name)) ||
            (input.ean && i.ean === input.ean)),
      );
      if (existing) {
        existing.qty = clampQty(existing.qty + qty);
        if (input.note) existing.note = input.note;
        existing.updatedAt = now();
        this.log(db, who, `added ${qty} more ${existing.name}`, listId);
        return existing;
      }
      const t = now();
      const item: Item = {
        id: newId(), listId, name, qty, ean: input.ean, productId: product?.id, note: input.note || undefined,
        status: 'todo', source: input.source, addedBy: who, createdAt: t, updatedAt: t,
      };
      db.items.push(item);
      this.log(db, who, `added ${qty > 1 ? `${qty} × ` : ''}${name}`, listId);
      return item;
    });
  }

  addUsuals(listId?: string, productIds?: string[], who?: string): Item[] {
    const usuals = this.store.data.products.filter((p) => (productIds ? productIds.includes(p.id) : p.usual));
    return usuals.map((p) => this.add({ name: p.label, productId: p.id, qty: p.defaultQty, listId, source: 'usuals' }, who));
  }

  update(itemId: string, changes: ItemChanges, who?: string): Item {
    return this.store.update((db) => {
      const item = db.items.find((i) => i.id === itemId);
      if (!item) throw new Error('Item not found');
      if (changes.name !== undefined && changes.name.trim()) item.name = changes.name.trim();
      if (changes.qty !== undefined) item.qty = clampQty(changes.qty);
      if (changes.productId !== undefined) item.productId = changes.productId ?? undefined;
      if (changes.note !== undefined) item.note = changes.note?.trim() || undefined;
      if (changes.listId && db.lists.some((l) => l.id === changes.listId)) item.listId = changes.listId;

      const product = findProduct(db.products, item);
      const key = itemKey(product?.id, item.name);
      if (changes.categoryId !== undefined && db.categories.some((c) => c.id === changes.categoryId)) {
        // Learn it: the category belongs to the thing, not this one line.
        item.categoryId = undefined;
        if (product) product.categoryId = changes.categoryId;
        else db.memory[key] = { ...db.memory[key], categoryId: changes.categoryId };
      }
      if (changes.price !== undefined) {
        const price = changes.price === null ? undefined : Math.max(0, Math.round(changes.price));
        if (product) product.price = price;
        else db.memory[key] = { ...db.memory[key], price };
      }

      if (changes.status && changes.status !== item.status) {
        if (changes.status === 'ticked') {
          item.status = 'ticked';
          item.tickedAt = now();
          db.purchases.push({ key, name: item.name, productId: product?.id, qty: item.qty, at: item.tickedAt });
          if (db.purchases.length > MAX_PURCHASES) db.purchases.splice(0, db.purchases.length - MAX_PURCHASES);
          this.log(db, who, `got ${item.name}`, item.listId);
        } else {
          // Unticked: forget the purchase it recorded.
          const idx = db.purchases.findIndex((p) => p.key === key && p.at === item.tickedAt);
          if (idx >= 0) db.purchases.splice(idx, 1);
          item.status = 'todo';
          item.tickedAt = undefined;
        }
      }
      item.updatedAt = now();
      return item;
    });
  }

  remove(itemId: string, who?: string) {
    this.store.update((db) => {
      const item = db.items.find((i) => i.id === itemId);
      if (item && item.status === 'todo') this.log(db, who, `removed ${item.name}`, item.listId);
      db.items = db.items.filter((i) => i.id !== itemId);
    });
  }

  clearDone(listId?: string): number {
    const id = this.listIdOr(listId);
    return this.store.update((db) => {
      const before = db.items.length;
      db.items = db.items.filter((i) => !(i.listId === id && i.status === 'ticked'));
      return before - db.items.length;
    });
  }

  // ---------- derived ----------

  categoryFor(item: Item, product = findProduct(this.store.data.products, item)): string {
    const db = this.store.data;
    const known = (c?: string) => (c && db.categories.some((x) => x.id === c) ? c : undefined);
    return (
      known(item.categoryId) ??
      known(product?.categoryId) ??
      known(db.memory[itemKey(product?.id, item.name)]?.categoryId) ??
      known(guessCategory(product?.label ?? item.name)) ??
      known(guessCategory(item.name)) ??
      known(product?.detail ? guessCategory(product.detail) : undefined) ??
      'other'
    );
  }

  /** Everything the UI needs to show one item. */
  resolve(item: Item) {
    const db = this.store.data;
    const p: Product | undefined = findProduct(db.products, item);
    const price = p ? p.price : db.memory[itemKey(undefined, item.name)]?.price;
    return {
      productId: p?.id,
      detail: p?.detail,
      imageUrl: p?.imageUrl,
      photo: p?.photo,
      categoryId: this.categoryFor(item, p),
      price,
    };
  }

  private log(db: { activity: { at: string; who?: string; text: string; listId?: string }[] }, who: string | undefined, text: string, listId?: string) {
    db.activity.push({ at: now(), who, text, listId });
    if (db.activity.length > MAX_ACTIVITY) db.activity.splice(0, db.activity.length - MAX_ACTIVITY);
  }
}

export const ALL_CATEGORY_IDS = DEFAULT_CATEGORIES.map((c) => c.id);
