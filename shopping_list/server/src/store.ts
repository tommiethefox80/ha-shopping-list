import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db, Item, Product } from './domain.js';
import { newId, now } from './domain.js';

/**
 * Tiny JSON-file store. The whole list fits comfortably in memory; every change is written
 * atomically (temp file + rename) so a crash can't leave a half-written file.
 */
export class Store {
  private db: Db;
  private readonly file: string;

  constructor(dataDir: string, seed: () => Product[] = () => []) {
    mkdirSync(dataDir, { recursive: true });
    this.file = join(dataDir, 'shopping-list.json');
    if (existsSync(this.file)) {
      this.db = migrate(JSON.parse(readFileSync(this.file, 'utf8')));
      this.flush();
    } else {
      this.db = { items: [], products: seed() };
      this.flush();
    }
  }

  get data(): Readonly<Db> {
    return this.db;
  }

  update<T>(fn: (db: Db) => T): T {
    const result = fn(this.db);
    this.flush();
    return result;
  }

  private flush() {
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    renameSync(tmp, this.file);
  }
}

type Legacy = Record<string, unknown>;

/** Upgrade data written by 1.x (Tesco version): keep the list and products, drop the Tesco fields. */
export function migrate(raw: { items?: Legacy[]; products?: Legacy[] }): Db {
  const products: Product[] = (raw.products ?? []).map((p) => ({
    id: String(p.id),
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
  const items: Item[] = (raw.items ?? []).map((i) => {
    const done = i.status === 'ticked' || i.status === 'in_basket';
    return {
      id: String(i.id),
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
  return { items, products };
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
