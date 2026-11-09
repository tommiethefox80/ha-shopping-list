import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Product } from '../domain.js';
import { newId, now } from '../domain.js';
import type { ItemChanges, ShoppingList } from '../list.js';
import { clampQty, normalize } from '../matching.js';
import { lookupBarcode, type BarcodeInfo } from '../openfoodfacts.js';
import type { Photos } from '../photos.js';
import type { Store } from '../store.js';
import { dueSuggestions, frequentNames } from '../suggestions.js';
import { importRecipe, ingredientName, isStaple } from '../recipes.js';
import type { Recipe } from '../domain.js';

export interface Deps {
  store: Store;
  list: ShoppingList;
  photos: Photos;
  barcodeLookup?: (ean: string) => Promise<BarcodeInfo | undefined>;
  fetcher?: typeof fetch;
  haStatus?: () => { connected: boolean; entities: string[]; error?: string } | undefined;
}

const fail = (reply: FastifyReply, code: number, e: unknown) => {
  const error = e instanceof Error ? e.message.split('\n')[0] : String(e);
  if (code >= 500) reply.log.error({ err: e }, error);
  return reply.code(code).send({ error });
};

/** Home Assistant ingress tells us who is signed in. */
export const whoIs = (req: FastifyRequest): string | undefined => {
  const h = req.headers['x-remote-user-display-name'] ?? req.headers['x-remote-user-name'];
  const v = Array.isArray(h) ? h[0] : h;
  return v ? decodeURIComponent(String(v)).slice(0, 60) : undefined;
};

export async function apiRoutes(app: FastifyInstance, d: Deps) {
  const { store, list, photos } = d;
  const lookup = d.barcodeLookup ?? lookupBarcode;
  const guard = async <T>(reply: FastifyReply, code: number, fn: () => T | Promise<T>) => {
    try {
      return await fn();
    } catch (e) {
      return fail(reply, code, e);
    }
  };

  app.get<{ Querystring: { listId?: string } }>('/api/state', async (req) => {
    const db = store.data;
    const listId = db.lists.some((l) => l.id === req.query.listId) ? req.query.listId! : db.lists[0].id;
    return {
      version: store.version,
      me: whoIs(req),
      lists: db.lists,
      categories: db.categories,
      items: db.items.map((i) => ({ ...i, resolved: list.resolve(i) })),
      products: db.products,
      suggestions: dueSuggestions(db, listId),
      frequent: frequentNames(db),
      memoryNames: Object.keys(db.memory).filter((k) => k.startsWith('n:')).map((k) => k.slice(2)),
      activity: db.activity.slice(-40).reverse(),
      ha: d.haStatus?.() ?? null,
      recipes: db.recipes.map((r) => ({ ...r, parsed: r.ingredients.map((l) => ({ name: ingredientName(l), staple: isStaple(l) })) })),
      plan: db.plan,
    };
  });

  // Live updates: tells each open app "something changed" so it refetches at once.
  app.get('/api/events', (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (v: number) => reply.raw.write(`event: changed\ndata: ${v}\n\n`);
    reply.raw.write(`retry: 3000\nevent: hello\ndata: ${store.version}\n\n`);
    const off = store.subscribe(send);
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => {
      off();
      clearInterval(ping);
    });
  });

  // ----- lists -----
  app.post<{ Body: { name: string } }>('/api/lists', (req, reply) => guard(reply, 400, () => list.createList(req.body?.name ?? '')));
  app.patch<{ Params: { id: string }; Body: { name?: string; aisleOrder?: string[] } }>('/api/lists/:id', (req, reply) =>
    guard(reply, 404, () => list.updateList(req.params.id, req.body ?? {})),
  );
  app.delete<{ Params: { id: string } }>('/api/lists/:id', (req, reply) =>
    guard(reply, 400, () => {
      list.deleteList(req.params.id);
      return { ok: true };
    }),
  );
  app.post<{ Params: { id: string } }>('/api/lists/:id/clear-done', async (req) => ({ removed: list.clearDone(req.params.id) }));

  // ----- aisles -----
  app.post<{ Body: { name: string; emoji?: string } }>('/api/categories', (req, reply) =>
    guard(reply, 400, () => list.addCategory(req.body?.name ?? '', req.body?.emoji)),
  );
  app.patch<{ Params: { id: string }; Body: { name?: string; emoji?: string } }>('/api/categories/:id', (req, reply) =>
    guard(reply, 404, () => list.updateCategory(req.params.id, req.body ?? {})),
  );
  app.delete<{ Params: { id: string } }>('/api/categories/:id', (req, reply) =>
    guard(reply, 400, () => {
      list.deleteCategory(req.params.id);
      return { ok: true };
    }),
  );

  // ----- items -----
  app.post<{ Body: { text?: string; name?: string; qty?: number; ean?: string; productId?: string; listId?: string; note?: string; source?: string } }>(
    '/api/items',
    (req, reply) => guard(reply, 400, () => list.add({ ...req.body, source: req.body?.source ?? 'app' }, whoIs(req) ?? req.body?.source)),
  );
  app.patch<{ Params: { id: string }; Body: ItemChanges }>('/api/items/:id', (req, reply) =>
    guard(reply, 404, () => list.update(req.params.id, req.body ?? {}, whoIs(req))),
  );
  app.delete<{ Params: { id: string } }>('/api/items/:id', async (req) => {
    list.remove(req.params.id, whoIs(req));
    return { ok: true };
  });
  app.post<{ Body: { listId?: string } }>('/api/items/clear-done', async (req) => ({ removed: list.clearDone(req.body?.listId) }));
  app.post<{ Body: { productIds?: string[]; listId?: string } }>('/api/usuals/add', async (req) =>
    list.addUsuals(req.body?.listId, req.body?.productIds, whoIs(req)),
  );

  // ----- barcode -----
  // Known barcode -> that product. Unknown -> look it up, save it as a product (so the next scan
  // is instant) and add it to the list.
  app.post<{ Body: { ean: string; listId?: string } }>('/api/scan', async (req, reply) => {
    const ean = String(req.body?.ean ?? '').replace(/\D/g, '');
    const listId = req.body?.listId;
    if (!/^\d{8,14}$/.test(ean)) return fail(reply, 400, 'Not a product barcode');
    const known = store.data.products.find((p) => p.eans.includes(ean));
    if (known) return { matched: true, item: list.add({ productId: known.id, ean, listId, source: 'scan' }, whoIs(req)) };
    const info = await lookup(ean);
    if (!info) return { matched: false, item: list.add({ name: `Barcode ${ean}`, ean, listId, source: 'scan' }, whoIs(req)) };
    const t = now();
    const product: Product = {
      id: newId(), label: info.name, aliases: [], detail: info.name, imageUrl: info.imageUrl,
      eans: [ean], defaultQty: 1, usual: false, createdAt: t, updatedAt: t,
    };
    store.update((db) => db.products.push(product));
    return { matched: false, lookedUp: info.name, item: list.add({ productId: product.id, ean, listId, source: 'scan' }, whoIs(req)) };
  });

  // ----- products -----
  type ProductBody = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'photo'>> & { photo?: string | null };
  const cleanList = (xs?: string[]) => [...new Set((xs ?? []).map((s) => s.trim()).filter(Boolean))];
  const price = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : Math.max(0, Math.round(Number(v))) || undefined);

  app.post<{ Body: ProductBody }>('/api/products', async (req, reply) => {
    const b = req.body ?? {};
    const label = (b.label ?? '').trim();
    if (!label) return fail(reply, 400, 'A name is required');
    const clash = store.data.products.find((p) =>
      [p.label, ...p.aliases].some((n) => [label, ...(b.aliases ?? [])].some((m) => normalize(m) === normalize(n))),
    );
    if (clash) return fail(reply, 409, `"${clash.label}" already uses that name`);
    const t = now();
    const product: Product = {
      id: newId(), label, aliases: cleanList(b.aliases), detail: b.detail?.trim() || undefined, imageUrl: b.imageUrl,
      photo: b.photo ?? undefined, categoryId: b.categoryId || undefined, price: price(b.price),
      eans: cleanList(b.eans), defaultQty: clampQty(b.defaultQty ?? 1), usual: !!b.usual, createdAt: t, updatedAt: t,
    };
    store.update((db) => db.products.push(product));
    return product;
  });

  app.patch<{ Params: { id: string }; Body: ProductBody }>('/api/products/:id', (req, reply) =>
    guard(reply, 404, () => {
      const b = req.body ?? {};
      return store.update((db) => {
        const p = db.products.find((x) => x.id === req.params.id);
        if (!p) throw new Error('Not found');
        if (b.label?.trim()) p.label = b.label.trim();
        if (b.aliases) p.aliases = cleanList(b.aliases);
        if (b.detail !== undefined) p.detail = b.detail?.trim() || undefined;
        if (b.imageUrl !== undefined) p.imageUrl = b.imageUrl || undefined;
        if (b.photo !== undefined) {
          if (p.photo && p.photo !== b.photo) photos.remove(p.photo);
          p.photo = b.photo || undefined;
        }
        if (b.categoryId !== undefined) p.categoryId = b.categoryId || undefined;
        if (b.price !== undefined) p.price = price(b.price);
        if (b.eans) p.eans = cleanList(b.eans);
        if (b.defaultQty !== undefined) p.defaultQty = clampQty(b.defaultQty);
        if (b.usual !== undefined) p.usual = !!b.usual;
        p.updatedAt = now();
        return p;
      });
    }),
  );

  app.delete<{ Params: { id: string } }>('/api/products/:id', async (req) => {
    store.update((db) => {
      const p = db.products.find((x) => x.id === req.params.id);
      photos.remove(p?.photo);
      db.products = db.products.filter((x) => x.id !== req.params.id);
      for (const i of db.items) if (i.productId === req.params.id) i.productId = undefined;
    });
    return { ok: true };
  });

  // ----- recipes & week plan -----
  const lines = (v: unknown) =>
    (Array.isArray(v) ? v.map(String) : String(v ?? '').split('\n')).map((l) => l.trim()).filter(Boolean).slice(0, 200);

  app.post<{ Body: { url: string } }>('/api/recipes/import', (req, reply) =>
    guard(reply, 422, async () => {
      const r = await importRecipe(String(req.body?.url ?? ''), d.fetcher);
      const dupe = store.data.recipes.find((x) => x.url && x.url === r.url);
      if (dupe) return dupe;
      store.update((db) => db.recipes.unshift(r));
      return r;
    }),
  );
  app.post<{ Body: Partial<Recipe> & { ingredients?: string | string[]; steps?: string | string[] } }>('/api/recipes', (req, reply) =>
    guard(reply, 400, () => {
      const b = req.body ?? {};
      const name = String(b.name ?? '').trim();
      if (!name) throw new Error('A name is required');
      const r: Recipe = {
        id: newId(), name, url: b.url || undefined, imageUrl: b.imageUrl || undefined,
        servings: Math.min(50, Math.max(1, Math.round(Number(b.servings) || 4))),
        ingredients: lines(b.ingredients), steps: lines(b.steps), createdAt: now(),
      };
      store.update((db) => db.recipes.unshift(r));
      return r;
    }),
  );
  app.patch<{ Params: { id: string }; Body: Partial<Recipe> & { ingredients?: string | string[]; steps?: string | string[] } }>(
    '/api/recipes/:id',
    (req, reply) =>
      guard(reply, 404, () =>
        store.update((db) => {
          const r = db.recipes.find((x) => x.id === req.params.id);
          if (!r) throw new Error('Recipe not found');
          const b = req.body ?? {};
          if (b.name?.trim()) r.name = b.name.trim();
          if (b.servings) r.servings = Math.min(50, Math.max(1, Math.round(Number(b.servings))));
          if (b.ingredients !== undefined) r.ingredients = lines(b.ingredients);
          if (b.steps !== undefined) r.steps = lines(b.steps);
          return r;
        }),
      ),
  );
  app.delete<{ Params: { id: string } }>('/api/recipes/:id', async (req) => {
    store.update((db) => {
      db.recipes = db.recipes.filter((r) => r.id !== req.params.id);
      for (const k of Object.keys(db.plan)) db.plan[k] = db.plan[k].filter((id) => id !== req.params.id);
    });
    return { ok: true };
  });

  /** Ingredients -> list items. Each line becomes an item named after the ingredient, with the full line as its note. */
  app.post<{ Body: { listId?: string; lines: { line: string; recipe?: string }[] } }>('/api/recipes/add-to-list', async (req) => {
    const who = whoIs(req);
    const added = (req.body?.lines ?? []).slice(0, 200).map(({ line, recipe }) => {
      const name = ingredientName(line);
      const note = line.toLowerCase() === name.toLowerCase() ? (recipe ? `for ${recipe}` : undefined) : `${recipe ? `${recipe}: ` : ''}${line}`;
      return list.add({ name, listId: req.body?.listId, note, source: 'recipe' }, who);
    });
    return { added: added.length };
  });

  app.put<{ Params: { date: string }; Body: { recipeIds: string[] } }>('/api/plan/:date', (req, reply) =>
    guard(reply, 400, () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) throw new Error('Bad date');
      const known = new Set(store.data.recipes.map((r) => r.id));
      const ids = (req.body?.recipeIds ?? []).filter((id) => known.has(id));
      store.update((db) => {
        if (ids.length) db.plan[req.params.date] = ids;
        else delete db.plan[req.params.date];
        // Keep the plan tidy: drop days more than 2 weeks ago.
        const cutoff = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
        for (const k of Object.keys(db.plan)) if (k < cutoff) delete db.plan[k];
      });
      return { ok: true };
    }),
  );

  // ----- photos -----
  app.post('/api/photos', (req, reply) => guard(reply, 400, () => ({ id: photos.save(req.body as Buffer) })));
  app.get<{ Params: { file: string } }>('/api/photos/:file', async (req, reply) => {
    const jpg = photos.read(req.params.file.replace(/\.jpg$/, ''));
    if (!jpg) return reply.code(404).send({ error: 'Not found' });
    return reply.header('Cache-Control', 'public, max-age=31536000, immutable').type('image/jpeg').send(jpg);
  });
}
