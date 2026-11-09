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

  it('needs the token off-ingress when one is set', async () => {
    const { app } = await make('abc');
    const remote = { remoteAddress: '192.0.2.10' };
    expect((await app.inject({ url: '/api/state', ...remote })).statusCode).toBe(401);
    expect((await app.inject({ url: '/api/state', headers: { authorization: 'Bearer abc' }, ...remote })).statusCode).toBe(200);
    expect((await app.inject({ url: '/api/state', remoteAddress: '172.30.32.2' })).statusCode).toBe(200);
  });
});
