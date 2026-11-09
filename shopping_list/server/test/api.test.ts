import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { defaultProducts, Store } from '../src/store.js';

const make = async (apiToken = '') => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-api-'));
  const store = new Store(dir, defaultProducts);
  const lookups: string[] = [];
  const { app } = await buildApp({ port: 0, dataDir: dir, apiToken, webDir: '/nonexistent' }, store, {
    logger: false,
    barcodeLookup: async (ean) => {
      lookups.push(ean);
      return ean === '5000157024671' ? { name: 'Heinz Baked Beans 415g', imageUrl: 'https://img/x.jpg' } : undefined;
    },
  });
  return { app, store, lookups };
};

describe('recipes API', () => {
  it('adds chosen ingredients to the list with the recipe line as a note, merging with what is there', async () => {
    const { app, store } = await make();
    await app.inject({ method: 'POST', url: '/api/items', payload: { text: 'chopped tomatoes' } });
    const r = await app.inject({ method: 'POST', url: '/api/recipes/add-to-list', payload: { lines: [
      { line: '1 x 400g can chopped tomatoes', recipe: 'Chilli' },
      { line: '500g lean minced beef', recipe: 'Chilli' },
    ] } });
    expect(r.json()).toEqual({ added: 2 });
    const items = store.data.items.map((i) => [i.name, i.qty, i.note ?? '']);
    expect(items).toEqual([
      ['chopped tomatoes', 2, 'Chilli: 1 x 400g can chopped tomatoes'],
      ['lean minced beef', 1, 'Chilli: 500g lean minced beef'],
    ]);
  });

  it('typed-in recipes with all the details, and editing them', async () => {
    const { app } = await make();
    const r = (await app.inject({ method: 'POST', url: '/api/recipes', payload: {
      name: 'Tacos', servings: 2, prepMinutes: '10', cookMinutes: 15, tags: 'Mexican, quick', description: 'Friday favourite',
      ingredients: '8 taco shells\nFor the salsa:\n2 tomatoes', steps: 'Brown the mince\nWarm the shells', notes: 'Kids like mild',
      imageUrl: 'https://img.example/tacos.jpg',
    } })).json();
    expect(r.imageUrl).toBe('https://img.example/tacos.jpg');
    expect(r).toMatchObject({ servings: 2, prepMinutes: 10, cookMinutes: 15, tags: ['mexican', 'quick'], notes: 'Kids like mild' });
    expect(r.ingredients).toEqual(['8 taco shells', 'For the salsa:', '2 tomatoes']);
    const edited = (await app.inject({ method: 'PATCH', url: `/api/recipes/${r.id}`, payload: { cookMinutes: '', servings: 4 } })).json();
    expect(edited).toMatchObject({ servings: 4, prepMinutes: 10 });
    expect(edited.cookMinutes).toBeUndefined();
    const state = (await app.inject('/api/state')).json();
    expect(state.recipes[0].parsed[1]).toMatchObject({ heading: true, name: 'For the salsa' });
  });

  it('headings are not added to the list', async () => {
    const { app, store } = await make();
    await app.inject({ method: 'POST', url: '/api/recipes/add-to-list', payload: { lines: [{ line: 'For the salsa:' }, { line: '2 tomatoes' }] } });
    expect(store.data.items.map((i) => i.name)).toEqual(['tomatoes']);
  });
});

describe('evening meal planner', () => {
  it('one meal a day: a recipe or just words, with servings; tonight endpoint', async () => {
    const { app, store } = await make();
    const r = (await app.inject({ method: 'POST', url: '/api/recipes', payload: { name: 'Chilli', servings: 4, ingredients: '500g mince' } })).json();
    const put = (d: string, payload: object) => app.inject({ method: 'PUT', url: `/api/meals/${d}`, payload });
    expect((await put('2026-11-16', { recipeId: r.id, servings: 6 })).json()).toEqual({ recipeId: r.id, servings: 6 });
    await put('2026-11-17', { text: 'Leftovers' });
    expect((await put('2026-11-18', {})).statusCode).toBe(400);
    expect((await put('nonsense', { text: 'x' })).statusCode).toBe(400);
    await put('2026-11-16', { text: 'Takeaway' }); // replaces, one meal a day
    expect(store.data.meals['2026-11-16']).toEqual({ text: 'Takeaway' });
    await put('2026-11-19', { recipeId: r.id });
    expect((await app.inject('/api/meals/today?date=2026-11-19')).json()).toEqual({ date: '2026-11-19', meal: 'Chilli', recipeId: r.id, servings: 4 });
    expect((await app.inject('/api/meals/today?date=2026-11-20')).json().meal).toBeNull();
    // Deleting a recipe keeps the evening planned, as words.
    await app.inject({ method: 'DELETE', url: `/api/recipes/${r.id}` });
    expect(store.data.meals['2026-11-19']).toMatchObject({ text: 'Chilli' });
    await app.inject({ method: 'DELETE', url: '/api/meals/2026-11-17' });
    expect(store.data.meals['2026-11-17']).toBeUndefined();
  });
});

describe('loyalty cards', () => {
  it('works out the barcode type from the number', async () => {
    const { app, store } = await make();
    const add = (payload: object) => app.inject({ method: 'POST', url: '/api/cards', payload }).then((r) => r.json());
    expect((await add({ name: 'Clubcard', number: '5000157024671' })).format).toBe('EAN13');
    expect((await add({ name: 'Other', number: '5000157024672' })).format).toBe('CODE128'); // bad check digit
    expect((await add({ name: 'App', number: 'ABC-123', format: 'QR' })).format).toBe('QR');
    expect(store.data.cards).toHaveLength(3);
    expect((await app.inject({ method: 'POST', url: '/api/cards', payload: { name: 'x', number: '' } })).statusCode).toBe(400);
  });
});

describe('API', () => {
  it('scanning an unknown barcode looks it up once, saves it as a product and adds it', async () => {
    const { app, store, lookups } = await make();
    const scan = () => app.inject({ method: 'POST', url: '/api/scan', payload: { ean: '5000157024671' } }).then((r) => r.json());
    const first = await scan();
    expect(first).toMatchObject({ matched: false, lookedUp: 'Heinz Baked Beans 415g' });
    const second = await scan();
    expect(second.matched).toBe(true);
    expect(lookups).toEqual(['5000157024671']);
    expect(store.data.items).toHaveLength(1);
    expect(store.data.items[0].qty).toBe(2);
  });

  it('an unrecognised barcode still goes on the list', async () => {
    const { app, store } = await make();
    const r = await app.inject({ method: 'POST', url: '/api/scan', payload: { ean: '1234567890123' } });
    expect(r.json().matched).toBe(false);
    expect(store.data.items[0].name).toBe('Barcode 1234567890123');
  });

  it('state includes product detail for each item', async () => {
    const { app } = await make();
    await app.inject({ method: 'POST', url: '/api/items', payload: { text: '2 beans' } });
    const s = (await app.inject('/api/state')).json();
    expect(s.items[0].resolved.detail).toBe('Branston Baked Beans in Tomato Sauce 410g');
  });

  it('records who made a change from the HA ingress headers', async () => {
    const { app, store } = await make();
    await app.inject({ method: 'POST', url: '/api/items', payload: { text: 'eggs' }, headers: { 'x-remote-user-display-name': 'Tom' } });
    expect(store.data.items[0].addedBy).toBe('Tom');
    expect((await app.inject('/api/state')).json().activity[0]).toMatchObject({ who: 'Tom', text: 'added eggs' });
  });

  it('stores and serves photos', async () => {
    const { app } = await make();
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const r = await app.inject({ method: 'POST', url: '/api/photos', payload: jpeg, headers: { 'content-type': 'image/jpeg' } });
    const { id } = r.json();
    const got = await app.inject(`/api/photos/${id}.jpg`);
    expect(got.statusCode).toBe(200);
    expect(got.rawPayload.equals(jpeg)).toBe(true);
    expect((await app.inject({ method: 'POST', url: '/api/photos', payload: Buffer.from('nope'), headers: { 'content-type': 'image/jpeg' } })).statusCode).toBe(400);
  });

  it('tells listeners about every change (live updates)', async () => {
    const { app, store } = await make();
    const seen: number[] = [];
    store.subscribe((v) => seen.push(v));
    await app.inject({ method: 'POST', url: '/api/items', payload: { text: 'eggs' } });
    await app.inject({ method: 'POST', url: '/api/items', payload: { text: 'eggs' } });
    expect(seen).toEqual([1, 2]);
  });

  it('needs the token off-ingress when one is set', async () => {
    const { app } = await make('abc');
    const remote = { remoteAddress: '192.0.2.10' };
    expect((await app.inject({ url: '/api/state', ...remote })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/state', headers: { authorization: 'Bearer abc' }, ...remote })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/state', remoteAddress: '172.30.32.2' })).statusCode).toBe(200);
  });
});
