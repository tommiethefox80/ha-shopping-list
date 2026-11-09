import type { Db, Purchase } from './domain.js';
import { findProduct, normalize } from './matching.js';

export interface Suggestion {
  key: string;
  name: string;
  productId?: string;
  /** Typical days between buys. */
  everyDays: number;
  daysSince: number;
  qty: number;
}

const DAY = 86_400_000;

/** Key used to group purchases and remember things: product id if known, else the normalised name. */
export function itemKey(productId: string | undefined, name: string): string {
  return productId ? `p:${productId}` : `n:${normalize(name)}`;
}

/**
 * "Running low" suggestions: things bought at least 3 times on different days, whose usual gap
 * since the last buy has (nearly) passed, and that aren't already on the list.
 */
export function dueSuggestions(db: Db, listId: string, at = Date.now(), limit = 8): Suggestion[] {
  const onList = new Set(
    db.items
      .filter((i) => i.listId === listId && i.status === 'todo')
      .map((i) => itemKey(findProduct(db.products, i)?.id, i.name)),
  );
  const byKey = new Map<string, Purchase[]>();
  for (const p of db.purchases) {
    if (!byKey.has(p.key)) byKey.set(p.key, []);
    byKey.get(p.key)!.push(p);
  }
  const out: (Suggestion & { score: number })[] = [];
  for (const [key, ps] of byKey) {
    if (onList.has(key)) continue;
    if (key.startsWith('p:') && !db.products.some((p) => `p:${p.id}` === key)) continue;
    const days = [...new Set(ps.map((p) => Math.floor(Date.parse(p.at) / DAY)))].sort((a, b) => a - b);
    if (days.length < 3) continue;
    const gaps = days.slice(1).map((d, i) => d - days[i]).sort((a, b) => a - b);
    const everyDays = gaps[Math.floor(gaps.length / 2)];
    if (everyDays < 1) continue;
    const daysSince = Math.floor(at / DAY) - days[days.length - 1];
    if (daysSince < everyDays * 0.85) continue;
    const last = ps[ps.length - 1];
    const product = last.productId ? db.products.find((p) => p.id === last.productId) : undefined;
    const qtys = ps.map((p) => p.qty).sort((a, b) => a - b);
    out.push({
      key, name: product?.label ?? last.name, productId: product?.id, everyDays, daysSince,
      qty: qtys[Math.floor(qtys.length / 2)], score: daysSince / everyDays,
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit).map(({ score: _s, ...s }) => s);
}

/** Names ranked by how often they've been bought (for autocomplete). */
export function frequentNames(db: Db, limit = 200): string[] {
  const counts = new Map<string, { name: string; n: number }>();
  for (const p of db.purchases) {
    const product = p.productId ? db.products.find((x) => x.id === p.productId) : undefined;
    const name = product?.label ?? p.name;
    const c = counts.get(p.key) ?? { name, n: 0 };
    c.n++;
    c.name = name;
    counts.set(p.key, c);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, limit).map((c) => c.name);
}
