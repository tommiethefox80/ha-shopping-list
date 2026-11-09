import type { Recipe } from './domain.js';
import { newId, now } from './domain.js';

type Json = Record<string, unknown>;

const text = (v: unknown): string =>
  typeof v === 'string'
    ? v.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
    : '';

const isRecipe = (o: Json) => {
  const t = o['@type'];
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
};

/** Finds a schema.org Recipe anywhere in the page's JSON-LD blocks (handles @graph and arrays). */
export function findRecipeJson(html: string): Json | undefined {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const visit = (node: unknown): Json | undefined => {
    if (Array.isArray(node)) {
      for (const n of node) {
        const r = visit(n);
        if (r) return r;
      }
      return undefined;
    }
    if (node && typeof node === 'object') {
      const o = node as Json;
      if (isRecipe(o)) return o;
      if (o['@graph']) return visit(o['@graph']);
      if (o.mainEntity) return visit(o.mainEntity);
    }
    return undefined;
  };
  for (const b of blocks) {
    try {
      const r = visit(JSON.parse(b.trim()));
      if (r) return r;
    } catch {
      /* skip malformed block */
    }
  }
  return undefined;
}

const firstNumber = (v: unknown): number | undefined => {
  const s = Array.isArray(v) ? v.map(String).join(' ') : String(v ?? '');
  const m = s.match(/\d+/);
  return m ? Number(m[0]) : undefined;
};

const steps = (v: unknown): string[] => {
  if (typeof v === 'string') return v.split(/\n+/).map(text).filter(Boolean);
  if (!Array.isArray(v)) return [];
  return v.flatMap((s) => {
    if (typeof s === 'string') return [text(s)];
    const o = s as Json;
    if (o['@type'] === 'HowToSection') return steps(o.itemListElement);
    return [text(o.text ?? o.name)];
  }).filter(Boolean);
};

const image = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return image(v[0]);
  if (v && typeof v === 'object') return image((v as Json).url);
  return undefined;
};

export function recipeFromHtml(html: string, url?: string): Recipe | undefined {
  const r = findRecipeJson(html);
  if (!r) return undefined;
  const ingredients = (Array.isArray(r.recipeIngredient) ? r.recipeIngredient : Array.isArray(r.ingredients) ? r.ingredients : [])
    .map(text)
    .filter(Boolean);
  if (!ingredients.length) return undefined;
  return {
    id: newId(),
    name: text(r.name) || 'Recipe',
    url,
    imageUrl: image(r.image),
    servings: Math.min(50, Math.max(1, firstNumber(r.recipeYield) ?? 4)),
    ingredients,
    steps: steps(r.recipeInstructions).slice(0, 60),
    createdAt: now(),
  };
}

/** Fetches a recipe page and reads its schema.org Recipe data. */
export async function importRecipe(url: string, fetcher: typeof fetch = fetch): Promise<Recipe> {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    throw new Error("That doesn't look like a web link");
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) links can be imported');
  const res = await fetcher(u, {
    headers: { 'User-Agent': 'Mozilla/5.0 (ShoppingList Home Assistant add-on)', Accept: 'text/html' },
    redirect: 'follow',
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`The site answered ${res.status}`);
  const html = (await res.text()).slice(0, 3_000_000);
  const recipe = recipeFromHtml(html, u.toString());
  if (!recipe) throw new Error("Couldn't find a recipe on that page. Try the site's print version, or type it in.");
  return recipe;
}

// ---------- ingredients -> list items ----------

const UNITS = [
  'kg', 'g', 'gram', 'grams', 'mg', 'ml', 'l', 'litre', 'litres', 'liter', 'liters', 'cl', 'oz', 'lb', 'lbs', 'pound', 'pounds',
  'tsp', 'teaspoon', 'teaspoons', 'tbsp', 'tbs', 'tablespoon', 'tablespoons', 'cup', 'cups', 'pint', 'pints',
  'pinch', 'pinches', 'handful', 'handfuls', 'clove', 'cloves', 'tin', 'tins', 'can', 'cans', 'pack', 'packs', 'packet', 'packets',
  'jar', 'jars', 'bunch', 'bunches', 'sprig', 'sprigs', 'slice', 'slices', 'sachet', 'sachets', 'stick', 'sticks', 'knob', 'dash',
  'x', 'piece', 'pieces', 'head', 'heads', 'bag', 'bags', 'bottle', 'bottles', 'carton', 'cartons', 'fillet', 'fillets',
];
const NUM = String.raw`(?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[½⅓⅔¼¾⅛])`;
const LEAD = new RegExp(String.raw`^\s*(?:about|approx\.?|around)?\s*${NUM}(?:\s*(?:-|–|to)\s*${NUM})?\s*(?:${UNITS.join('|')})?\.?\b\s*(?:of\s+)?`, 'i');
const UNIT_ONLY = new RegExp(String.raw`^\s*(?:a|an|one)?\s*(?:${UNITS.join('|')})\.?\s+(?:of\s+)?`, 'i');

/** Things nearly everyone already has; shown unticked so they aren't added by accident. */
const STAPLES = /^(salt|black pepper|pepper|salt and pepper|salt & pepper|water|cold water|boiling water|warm water|ice|oil|vegetable oil|olive oil|sunflower oil|cooking spray)$/i;

/** "400g tin chopped tomatoes, drained" -> "chopped tomatoes". */
export function ingredientName(line: string): string {
  let s = line.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    const before = s;
    s = s.replace(LEAD, '').replace(UNIT_ONLY, '').trim();
    if (s === before) break;
  }
  s = s.split(/,| - | – |;| for (?:the |serving|garnish)| to serve| plus extra/i)[0].trim();
  s = s.replace(/^(of|x)\s+/i, '').replace(/\s+(optional)$/i, '').trim();
  return s ? s[0].toLowerCase() + s.slice(1) : line.trim();
}

export const isStaple = (line: string) => STAPLES.test(ingredientName(line));

/** Multiplies the leading amount(s) in an ingredient line: scaleLine("400g pasta", 1.5) -> "600g pasta". */
export function scaleLine(line: string, factor: number): string {
  if (factor === 1) return line;
  const frac: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 };
  const val = (t: string) => (frac[t] ?? (t.includes('/') ? Number(t.split('/')[0]) / Number(t.split('/')[1]) : Number(t.replace(',', '.'))));
  const fmt = (n: number) => {
    const r = Math.round(n * 100) / 100;
    if (Math.abs(r - Math.round(r)) < 0.01) return String(Math.round(r));
    return String(r);
  };
  return line.replace(new RegExp(String.raw`^(\s*)(${NUM})(\s*[-–]\s*(${NUM}))?`), (_m, sp, a, range, b) =>
    `${sp}${fmt(val(a.replace(/\s/g, '')) * factor)}${range ? `-${fmt(val(b.replace(/\s/g, '')) * factor)}` : ''}`,
  );
}
