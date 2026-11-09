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

  it('typed-in recipes and the week plan', async () => {
    const { app, store } = await make();
    const r = (await app.inject({ method: 'POST', url: '/api/recipes', payload: { name: 'Tacos', servings: 2, ingredients: '8 taco shells\n400g beef mince' } })).json();
    expect(r.ingredients).toEqual(['8 taco shells', '400g beef mince']);
    const day = new Date().toISOString().slice(0, 10);
    await app.inject({ method: 'PUT', url: `/api/plan/${day}`, payload: { recipeIds: [r.id, 'nope'] } });
    expect(store.data.plan[day]).toEqual([r.id]);
    await app.inject({ method: 'DELETE', url: `/api/recipes/${r.id}` });
    expect(store.data.plan[day]).toEqual([]);
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
