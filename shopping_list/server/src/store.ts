import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db, Product } from './domain.js';
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
      const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Db>;
      this.db = { items: raw.items ?? [], products: raw.products ?? [] };
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

/** Defaults agreed with Tom: usuals plus "beans" and "chopped tomatoes". */
export function defaultProducts(): Product[] {
  const t = now();
  const p = (
    label: string,
    aliases: string[],
    tescoId: string,
    tescoName: string,
    usual = false,
  ): Product => ({
    id: newId(), label, aliases, tescoId, tescoName, eans: [], defaultQty: 1, usual, createdAt: t, updatedAt: t,
  });
  return [
    p('Whole milk', ['milk', 'full fat milk'], '254656399', 'Tesco British Whole Milk 2.272L, 4 Pints', true),
    p('Semi skimmed milk', ['semi skimmed', 'semi skimmed milk 2l'], '253737115', 'Tesco Filtered Semi Skimmed Milk 2 Litre', true),
    p('Bread', ['loaf', 'wholemeal bread', 'wholemeal loaf'], '300134377', 'Tesco Finest Wholemeal Loaf 800G', true),
    p('Cat food', ['whiskas', 'cat food pouches'], '313620945', 'Whiskas 7+ Senior Wet Cat Food Fish Favourites in Jelly 12x85g', true),
    p('Beans', ['baked beans', 'branston beans'], '275205504', 'Branston Baked Beans In Tomato Sauce 410G'),
    p('Chopped tomatoes', ['tinned tomatoes', 'tin of tomatoes'], '251825089', 'Tesco Italian Chopped Tomatoes 400G'),
    p('Nappies', ['pampers', 'size 6 nappies'], '288089822', 'Pampers Baby-Dry Size 6 Nappies 33 Pack'),
  ];
}
