import type { Product } from './domain.js';

export function normalize(s: string): string {
  return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Simple singular/plural variants so "egg" matches "eggs" and "tomatoes" matches "tomato". */
export function variants(s: string): Set<string> {
  const n = normalize(s);
  const v = new Set([n]);
  if (n.endsWith('ies')) v.add(n.slice(0, -3) + 'y');
  if (n.endsWith('es')) v.add(n.slice(0, -2));
  if (n.endsWith('s')) v.add(n.slice(0, -1));
  else v.add(n + 's');
  return v;
}

/** True if two names are the same once case, punctuation and plurals are ignored. */
export function sameThing(a: string, b: string): boolean {
  const va = variants(a);
  for (const x of variants(b)) if (va.has(x)) return true;
  return false;
}

export function productNames(p: Product): string[] {
  return [p.label, ...p.aliases];
}

/** Resolve the default product for a list item: explicit choice, then barcode, then name/alias. */
export function findProduct(
  products: Product[],
  item: { name: string; ean?: string; productId?: string },
): Product | undefined {
  if (item.productId) {
    const p = products.find((x) => x.id === item.productId);
    if (p) return p;
  }
  if (item.ean) {
    const p = products.find((x) => x.eans.includes(item.ean!));
    if (p) return p;
  }
  return products.find((p) => productNames(p).some((n) => sameThing(n, item.name)));
}

/** "2 beans", "2x beans", "beans x2", "beans 2" -> { name: "beans", qty: 2 } */
export function parseItemText(text: string): { name: string; qty: number } {
  const t = text.trim().replace(/\s+/g, ' ');
  let m = t.match(/^(\d{1,2})\s*x?\s+(.+)$/i);
  if (m) return { name: m[2].trim(), qty: clampQty(Number(m[1])) };
  m = t.match(/^(.+?)\s+x\s*(\d{1,2})$/i) ?? t.match(/^(.+?)\s+(\d{1,2})$/);
  if (m) return { name: m[1].trim(), qty: clampQty(Number(m[2])) };
  return { name: t, qty: 1 };
}

export function clampQty(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(99, Math.max(1, Math.round(n)));
}

/** Accepts a Tesco product URL or a bare product id. */
export function parseTescoId(input: string): string | undefined {
  const s = input.trim();
  const m = s.match(/\/products\/(\d{6,12})/) ?? s.match(/^(\d{6,12})$/);
  return m?.[1];
}
