import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HaSensors } from '../src/hasensors.js';
import { ShoppingList } from '../src/list.js';
import { defaultProducts, Store } from '../src/store.js';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const tomorrow = () => new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

describe('Home Assistant sensors', () => {
  it("publishes tonight's dinner with its photo, and the list count; only re-sends on change", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'sl-sens-'));
    const wwwDir = join(dataDir, 'www');
    mkdirSync(join(dataDir, 'photos'), { recursive: true });
    writeFileSync(join(dataDir, 'photos', '11111111-1111-1111-1111-111111111111.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const store = new Store(dataDir, defaultProducts);
    const list = new ShoppingList(store);
    store.update((db) => {
      db.recipes.push({ id: 'r1', name: 'Chilli', servings: 4, prepMinutes: 10, cookMinutes: 60, tags: ['mexican'], ingredients: [], steps: [],
        photo: '11111111-1111-1111-1111-111111111111', createdAt: 'x' });
      db.meals[today()] = { recipeId: 'r1', servings: 6 };
      db.meals[tomorrow()] = { text: 'Takeaway' };
    });
    list.add({ text: '2 beans' });
    list.add({ text: 'eggs' });

    const posts: { url: string; body: { state: string; attributes: Record<string, unknown> }; auth: string }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      posts.push({ url, body: JSON.parse(String(init.body)), auth: String((init.headers as Record<string, string>).Authorization) });
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    const s = new HaSensors(store, { apiUrl: 'http://ha/api', token: 'tok', dataDir, wwwDir, timeZone: 'Europe/London', fetcher });

    await s.publish();
    const dinner = posts.find((p) => p.url === 'http://ha/api/states/sensor.tonights_dinner')!;
    expect(dinner.auth).toBe('Bearer tok');
    expect(dinner.body.state).toBe('Chilli');
    expect(dinner.body.attributes).toMatchObject({
      servings: 6, total_minutes: 70, tomorrow: 'Takeaway', entity_picture: '/local/shopping_list/11111111-1111-1111-1111-111111111111.jpg',
    });
    expect((dinner.body.attributes.week as unknown[]).length).toBe(7);
    expect(existsSync(join(wwwDir, 'shopping_list', '11111111-1111-1111-1111-111111111111.jpg'))).toBe(true);
    const items = posts.find((p) => p.url.endsWith('sensor.shopping_list_items'))!;
    expect(items.body.state).toBe('2');
    expect(items.body.attributes.items).toEqual(['beans ×2', 'eggs']);

    const n = posts.length;
    await s.publish();
    expect(posts.length).toBe(n); // nothing changed
    list.add({ text: 'milk' });
    await s.publish();
    expect(posts.length).toBe(n + 1);
    expect(posts.at(-1)!.body.state).toBe('3');
  });

  it('says Nothing planned when there is no meal', () => {
    const store = new Store(mkdtempSync(join(tmpdir(), 'sl-sens2-')), defaultProducts);
    const s = new HaSensors(store, { apiUrl: 'x', token: 'y', dataDir: '/tmp' });
    expect(s.states()['sensor.tonights_dinner']).toMatchObject({ state: 'Nothing planned', attributes: { planned: false } });
  });
});
