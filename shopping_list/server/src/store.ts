import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_CATEGORIES } from './categories.js';
import type { Db, Item, Product, ShopList } from './domain.js';
import { newId, now } from './domain.js';

type Listener = (version: number) => void;

/**
 * Tiny JSON-file store. Everything fits comfortably in memory; every change is written
 * atomically (temp file + rename). Listeners hear about every change (drives live updates).
 */
export class Store {
  private db: Db;
  private readonly file: string;
  private listeners = new Set<Listener>();
  version = 0;

  constructor(readonly dataDir: string, seed: () => Product[] = () => []) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'shopping-list.json');
    this.db = existsSync(this.file)
      ? migrate(JSON.parse(readFileSync(this.file, 'utf8')))
      : migrate({ products: seed() as unknown as Legacy[] });
    this.flush(false);
  }

  get data(): Readonly<Db> {
    return this.db;
  }

  update<T>(fn: (db: Db) => T): T {
    const result = fn(this.db);
    this.flush(true);
    return result;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private flush(notify: boolean) {
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    renameSync(tmp, this.file);
    if (notify) {
      this.version++;
      for (const l of this.listeners) l(this.version);
    }
  }
}

type Legacy = Record<string, unknown>;

/** Bring any earlier data (1.x Tesco version, 2.x single list) up to the v3 model. */
export function migrate(raw: Omit<Partial<Db>, 'items' | 'products'> & { items?: Legacy[]; products?: Legacy[] }): Db {
  if (raw.version === 3) {
    return {
      version: 3,
      lists: raw.lists ?? [],
      categories: raw.categories?.length ? raw.categories : structuredClone(DEFAULT_CATEGORIES),
      items: (raw.items ?? []) as unknown as Item[],
      products: (raw.products ?? []) as unknown as Product[],
      memory: raw.memory ?? {},
      purchases: raw.purchases ?? [],
      activity: raw.activity ?? [],
      haSync: raw.haSync ?? {},
      recipes: raw.recipes ?? [],
      plan: raw.plan ?? {},
    };
  }
  const list: ShopList = { id: newId(), name: 'Weekly shop', aisleOrder: DEFAULT_CATEGORIES.map((c) => c.id), createdAt: now() };
  const products: Product[] = (raw.products ?? []).map((p: Legacy) => ({
    id: String(p.id ?? newId()),
    label: String(p.label),
    aliases: (p.aliases as string[]) ?? [],
    detail: (p.detail as string) ?? (p.tescoName as string) ?? undefined,
    imageUrl: (p.imageUrl as string) ?? undefined,
    eans: (p.eans as string[]) ?? [],
    defaultQty: Number(p.defaultQty ?? 1),
    usual: Boolean(p.usual ?? p.regular ?? false),
    createdAt: String(p.createdAt ?? now()),
    updatedAt: String(p.updatedAt ?? now()),
  }));
  const items: Item[] = (raw.items ?? []).map((i: Legacy) => {
    const done = i.status === 'ticked' || i.status === 'in_basket';
    return {
      id: String(i.id),
      listId: list.id,
      name: String(i.name),
      qty: Number(i.qty ?? 1),
      ean: (i.ean as string) ?? undefined,
      productId: (i.productId as string) ?? undefined,
      status: done ? 'ticked' : 'todo',
      source: (i.source as string) ?? undefined,
      createdAt: String(i.createdAt ?? now()),
      updatedAt: String(i.updatedAt ?? now()),
      tickedAt: done ? String(i.addedAt ?? i.tickedAt ?? i.updatedAt ?? now()) : undefined,
    };
  });
  return {
    version: 3, lists: [list], categories: structuredClone(DEFAULT_CATEGORIES), items, products, memory: {}, purchases: [], activity: [], haSync: {}, recipes: [], plan: {},
  };
}

/** Starting products: the usuals plus the defaults agreed with Tom. */
export function defaultProducts(): Product[] {
  const t = now();
  const p = (label: string, aliases: string[], detail: string, usual = false): Product => ({
    id: newId(), label, aliases, detail, eans: [], defaultQty: 1, usual, createdAt: t, updatedAt: t,
  });
  return [
    p('Whole milk', ['milk', 'full fat milk'], 'Tesco British Whole Milk 4 pints', true),
    p('Semi skimmed milk', ['semi skimmed'], 'Tesco Filtered Semi Skimmed Milk 2L', true),
    p('Bread', ['loaf', 'wholemeal bread', 'wholemeal loaf'], 'Tesco Finest Wholemeal Loaf 800g', true),
    p('Cat food', ['whiskas'], 'Whiskas 7+ Senior Fish Favourites in Jelly 12×85g', true),
    p('Beans', ['baked beans', 'branston beans'], 'Branston Baked Beans in Tomato Sauce 410g'),
    p('Chopped tomatoes', ['tinned tomatoes', 'tin of tomatoes'], 'Tesco Italian Chopped Tomatoes 400g'),
    p('Nappies', ['size 6 nappies'], 'Size 6 — Pampers Baby-Dry if on offer, otherwise Fred & Flo'),
  ];
}
