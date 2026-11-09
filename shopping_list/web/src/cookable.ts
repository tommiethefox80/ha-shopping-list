import type { Recipe } from './types';

/** Words that don't identify an ingredient. */
const FILLER = new Set([
  'and', 'the', 'with', 'for', 'fresh', 'large', 'small', 'medium', 'lean', 'chopped', 'finely', 'roughly', 'sliced', 'diced', 'grated',
  'crushed', 'peeled', 'tin', 'can', 'pack', 'packet', 'jar', 'bag', 'free', 'range', 'british', 'tesco', 'finest', 'organic', 'whole',
  'ground', 'dried', 'frozen', 'ripe', 'boneless', 'skinless', 'extra', 'virgin', 'plain', 'unsalted', 'salted', 'light', 'low', 'fat',
]);

/** "minced" -> "minc", "tomatoes" -> "tomato", "breasts" -> "breast". */
const stem = (w: string) => w.replace(/(ies)$/, 'y').replace(/(oes|ses|xes)$/, (m) => m.slice(0, -2)).replace(/(ed|es|s)$/, '').replace(/e$/, '');

export const words = (s: string) =>
  s.toLowerCase().replace(/[^a-z ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !FILLER.has(w)).map(stem);

/**
 * True if something you have covers this ingredient: all the words of what you have appear in it
 * ("mince" covers "lean minced beef"), or all its words appear in what you have (a long product
 * name like "Tesco Italian Chopped Tomatoes 400g" covers "chopped tomatoes").
 */
export function covers(have: string[][], ingredient: string): boolean {
  const ingList = words(ingredient);
  const ing = new Set(ingList);
  if (!ing.size) return false;
  return have.some((h) => {
    if (!h.length) return false;
    const hs = new Set(h);
    return h.every((w) => ing.has(w)) || ingList.every((w) => hs.has(w));
  });
}

export interface Cookable {
  recipe: Recipe;
  needed: number;
  have: number;
  missing: { line: string; name: string }[];
}

/** Ranks recipes by how little you'd need to buy. Staples (salt, oil…) and headings don't count. */
export function rankRecipes(recipes: Recipe[], haveNames: string[]): Cookable[] {
  const have = haveNames.map(words).filter((w) => w.length);
  return recipes
    .map((recipe) => {
      const needed = recipe.ingredients
        .map((line, i) => ({ line, p: recipe.parsed[i] }))
        .filter(({ p }) => p && !p.heading && !p.staple);
      const missing = needed.filter(({ p }) => !covers(have, p.name)).map(({ line, p }) => ({ line, name: p.name }));
      return { recipe, needed: needed.length, have: needed.length - missing.length, missing };
    })
    .filter((c) => c.needed > 0)
    .sort((a, b) => a.missing.length - b.missing.length || b.have / b.needed - a.have / a.needed || a.recipe.name.localeCompare(b.recipe.name));
}
