import { describe, expect, it } from 'vitest';
import { importRecipe, ingredientName, isHeading, isoMinutes, isStaple, recipeFromHtml, scaleLine } from '../src/recipes.js';

const page = (ld: unknown) => `<html><head><title>x</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"Food"}</script>
<script type="application/ld+json">${JSON.stringify(ld)}</script></head><body>…</body></html>`;

const chilli = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', name: 'Chilli' },
    {
      '@type': ['Recipe', 'NewsArticle'],
      name: 'Easy chilli con carne',
      image: [{ '@type': 'ImageObject', url: 'https://img.example/chilli.jpg' }],
      recipeYield: '4 servings',
      description: 'A <b>simple</b> family chilli',
      prepTime: 'PT10M', cookTime: 'PT1H5M',
      recipeCategory: 'Dinner', recipeCuisine: ['Mexican'],
      recipeIngredient: [
        '1 tbsp oil', '1 large onion, finely chopped', '2 garlic cloves, crushed', '500g lean minced beef',
        '1 x 400g can chopped tomatoes', '400g can red kidney beans, drained', '½ tsp hot chilli powder',
        'salt and pepper', '1 beef stock cube', 'soured cream, to serve',
      ],
      recipeInstructions: [
        { '@type': 'HowToStep', text: 'Fry the onion.' },
        { '@type': 'HowToSection', name: 'Sauce', itemListElement: [{ '@type': 'HowToStep', text: 'Add &amp; simmer <b>20 mins</b>.' }] },
      ],
    },
  ],
};

describe('recipe import', () => {
  it('reads schema.org Recipe from @graph with typed arrays and sections', () => {
    const r = recipeFromHtml(page(chilli), 'https://food.example/chilli')!;
    expect(r).toMatchObject({ name: 'Easy chilli con carne', servings: 4, imageUrl: 'https://img.example/chilli.jpg' });
    expect(r.ingredients).toHaveLength(10);
    expect(r.steps).toEqual(['Fry the onion.', 'Sauce:', 'Add & simmer 20 mins .']);
    expect(r).toMatchObject({ description: 'A simple family chilli', prepMinutes: 10, cookMinutes: 65, tags: ['dinner', 'mexican'] });
  });

  it('says so when a page has no recipe', () => {
    expect(recipeFromHtml(page({ '@type': 'Article', name: 'x' }))).toBeUndefined();
  });

  it('fetches a page through the given fetcher and rejects non-web links', async () => {
    const fake = (async () => new Response(page(chilli), { status: 200 })) as unknown as typeof fetch;
    expect((await importRecipe('https://food.example/chilli', fake)).name).toBe('Easy chilli con carne');
    await expect(importRecipe('file:///etc/passwd', fake)).rejects.toThrow(/http/);
    await expect(importRecipe('not a link', fake)).rejects.toThrow(/web link/);
  });
});

describe('ingredient -> list item name', () => {
  const cases: [string, string][] = [
    ['1 large onion, finely chopped', 'large onion'],
    ['2 garlic cloves, crushed', 'garlic cloves'],
    ['500g lean minced beef', 'lean minced beef'],
    ['1 x 400g can chopped tomatoes', 'chopped tomatoes'],
    ['400g can red kidney beans, drained', 'red kidney beans'],
    ['½ tsp hot chilli powder', 'hot chilli powder'],
    ['1 beef stock cube', 'beef stock cube'],
    ['soured cream, to serve', 'soured cream'],
    ['2-3 tbsp olive oil', 'olive oil'],
    ['200ml (7fl oz) double cream', 'double cream'],
    ['3 to 4 ripe bananas', 'ripe bananas'],
    ['a pinch of salt', 'salt'],
    ['Spaghetti', 'spaghetti'],
  ];
  it.each(cases)('%s -> %s', (line, name) => expect(ingredientName(line)).toBe(name));
  it('flags staples', () => {
    expect(isStaple('salt and pepper')).toBe(true);
    expect(isStaple('1 tbsp olive oil')).toBe(true);
    expect(isStaple('500g lean minced beef')).toBe(false);
  });
});

describe('scaling', () => {
  it('scales leading amounts, fractions and ranges', () => {
    expect(scaleLine('400g pasta', 1.5)).toBe('600g pasta');
    expect(scaleLine('½ tsp chilli', 2)).toBe('1 tsp chilli');
    expect(scaleLine('2-3 tbsp oil', 2)).toBe('4-6 tbsp oil');
    expect(scaleLine('1/2 onion', 3)).toBe('1.5 onion');
    expect(scaleLine('salt', 2)).toBe('salt');
  });
});

describe('details', () => {
  it('reads ISO durations and spots headings', () => {
    expect(isoMinutes('PT1H30M')).toBe(90);
    expect(isoMinutes('PT45M')).toBe(45);
    expect(isoMinutes('P0DT2H')).toBe(120);
    expect(isoMinutes('')).toBeUndefined();
    expect(isHeading('For the sauce:')).toBe(true);
    expect(isHeading('2 tbsp oil:')).toBe(false);
    expect(isHeading('500g mince')).toBe(false);
  });
});
