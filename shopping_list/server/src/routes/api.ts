import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Product } from '../domain.js';
import { newId, now } from '../domain.js';
import type { ItemChanges, ShoppingList } from '../list.js';
import { clampQty, normalize } from '../matching.js';
import { lookupBarcode, type BarcodeInfo } from '../openfoodfacts.js';
import type { Photos } from '../photos.js';
import type { Store } from '../store.js';
import { dueSuggestions, frequentNames } from '../suggestions.js';
import { importRecipe, ingredientName, isHeading, isStaple } from '../recipes.js';
import type { LoyaltyCard, Meal, Recipe } from '../domain.js';

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
      // Bought in the last week (for "What can I make?"): product name + its "we mean" detail.
      recentlyBought: [...new Set(
        db.purchases
          .filter((p) => Date.now() - Date.parse(p.at) < 7 * 86_400_000)
          .flatMap((p) => {
            const prod = p.productId ? db.products.find((x) => x.id === p.productId) : undefined;
            return [prod?.label ?? p.name, ...(prod?.detail ? [prod.detail] : [])];
          }),
      )],
      memoryNames: Object.keys(db.memory).filter((k) => k.startsWith('n:')).map((k) => k.slice(2)),
      history: Object.entries(db.history)
        .filter(([k, h]) => !k.startsWith('p:') || db.products.some((p) => p.id === h.productId))
        .map(([key, h]) => ({ key, ...h }))
        .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt))
        .slice(0, 1500),
      activity: db.activity.slice(-40).reverse(),
      ha: d.haStatus?.() ?? null,
      recipes: db.recipes.map((r) => ({
        ...r,
        parsed: r.ingredients.map((l) => (isHeading(l) ? { name: l.replace(/:\s*$/, ''), staple: false, heading: true } : { name: ingredientName(l), staple: isStaple(l) })),
      })),
      meals: db.meals,
      cards: db.cards,
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
  app.delete<{ Params: { key: string } }>('/api/history/:key', async (req) => {
    list.forget(decodeURIComponent(req.params.key));
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
  type RecipeBody = Partial<Omit<Recipe, 'tags' | 'ingredients' | 'steps'>> & {
    ingredients?: string | string[];
    steps?: string | string[];
    tags?: string | string[];
    photo?: string | null;
  };
  const mins = (v: unknown) => (v === null || v === '' || v === undefined ? undefined : Math.min(9999, Math.max(0, Math.round(Number(v)))) || undefined);
  const tags = (v: unknown) =>
    [...new Set((Array.isArray(v) ? v.map(String) : String(v ?? '').split(',')).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10);
  const applyRecipe = (r: Recipe, b: RecipeBody) => {
    if (b.name !== undefined && b.name.trim()) r.name = b.name.trim();
    if (b.description !== undefined) r.description = b.description?.trim() || undefined;
    if (b.servings !== undefined) r.servings = Math.min(50, Math.max(1, Math.round(Number(b.servings) || 4)));
    if (b.prepMinutes !== undefined) r.prepMinutes = mins(b.prepMinutes);
    if (b.cookMinutes !== undefined) r.cookMinutes = mins(b.cookMinutes);
    if (b.tags !== undefined) r.tags = tags(b.tags);
    if (b.ingredients !== undefined) r.ingredients = lines(b.ingredients);
    if (b.steps !== undefined) r.steps = lines(b.steps);
    if (b.notes !== undefined) r.notes = b.notes?.trim() || undefined;
    if (b.url !== undefined) r.url = b.url?.trim() || undefined;
    if (b.imageUrl !== undefined) r.imageUrl = /^https?:\/\//.test(b.imageUrl ?? '') ? b.imageUrl : undefined;
    if (b.photo !== undefined) {
      if (r.photo && r.photo !== b.photo) photos.remove(r.photo);
      r.photo = b.photo || undefined;
    }
    r.updatedAt = now();
  };

  app.post<{ Body: RecipeBody }>('/api/recipes', (req, reply) =>
    guard(reply, 400, () => {
      const b = req.body ?? {};
      if (!String(b.name ?? '').trim()) throw new Error('A name is required');
      const r: Recipe = { id: newId(), name: '', servings: 4, tags: [], ingredients: [], steps: [], createdAt: now() };
      applyRecipe(r, b);
      store.update((db) => db.recipes.unshift(r));
      return r;
    }),
  );
  app.patch<{ Params: { id: string }; Body: RecipeBody }>('/api/recipes/:id', (req, reply) =>
    guard(reply, 404, () =>
      store.update((db) => {
        const r = db.recipes.find((x) => x.id === req.params.id);
        if (!r) throw new Error('Recipe not found');
        applyRecipe(r, req.body ?? {});
        return r;
      }),
    ),
  );
  app.delete<{ Params: { id: string } }>('/api/recipes/:id', async (req) => {
    store.update((db) => {
      const r = db.recipes.find((x) => x.id === req.params.id);
      photos.remove(r?.photo);
      db.recipes = db.recipes.filter((x) => x.id !== req.params.id);
      // Keep planned evenings, just as words.
      for (const m of Object.values(db.meals)) if (m.recipeId === req.params.id) Object.assign(m, { recipeId: undefined, text: r?.name });
    });
    return { ok: true };
  });

  /** Ingredients -> list items. Each line becomes an item named after the ingredient, with the full line as its note. */
  app.post<{ Body: { listId?: string; lines: { line: string; recipe?: string }[] } }>('/api/recipes/add-to-list', async (req) => {
    const who = whoIs(req);
    const added = (req.body?.lines ?? []).slice(0, 200).filter(({ line }) => !isHeading(line)).map(({ line, recipe }) => {
      const name = ingredientName(line);
      const note = line.toLowerCase() === name.toLowerCase() ? (recipe ? `for ${recipe}` : undefined) : `${recipe ? `${recipe}: ` : ''}${line}`;
      return list.add({ name, listId: req.body?.listId, note, source: 'recipe' }, who);
    });
    return { added: added.length };
  });

  // ----- evening meal planner -----
  const dayOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d));
  app.put<{ Params: { date: string }; Body: Meal }>('/api/meals/:date', (req, reply) =>
    guard(reply, 400, () => {
      if (!dayOk(req.params.date)) throw new Error('Bad date');
      const b = req.body ?? {};
      const recipeId = b.recipeId && store.data.recipes.some((r) => r.id === b.recipeId) ? b.recipeId : undefined;
      const text = String(b.text ?? '').trim().slice(0, 80) || undefined;
      if (!recipeId && !text) throw new Error('Pick a recipe or type what you are having');
      const meal: Meal = { recipeId, text: recipeId ? undefined : text, servings: b.servings ? Math.min(50, Math.max(1, Math.round(Number(b.servings)))) : undefined };
      store.update((db) => {
        db.meals[req.params.date] = meal;
        const cutoff = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
        for (const k of Object.keys(db.meals)) if (k < cutoff) delete db.meals[k];
      });
      return meal;
    }),
  );
  app.delete<{ Params: { date: string } }>('/api/meals/:date', async (req) => {
    store.update((db) => {
      delete db.meals[req.params.date];
    });
    return { ok: true };
  });
  /** For a Home Assistant REST sensor / dashboard: what's for tea tonight. */
  app.get<{ Querystring: { date?: string } }>('/api/meals/today', async (req) => {
    const d = req.query.date && dayOk(req.query.date) ? req.query.date : new Date().toLocaleDateString('en-CA', { timeZone: process.env.TZ || 'Europe/London' });
    const m = store.data.meals[d];
    const r = m?.recipeId ? store.data.recipes.find((x) => x.id === m.recipeId) : undefined;
    return { date: d, meal: r?.name ?? m?.text ?? null, recipeId: r?.id ?? null, servings: m?.servings ?? r?.servings ?? null };
  });

  // ----- loyalty cards -----
  const ean13ok = (n: string) => {
    if (!/^\d{13}$/.test(n)) return false;
    const d = n.split('').map(Number);
    const sum = d.slice(0, 12).reduce((s, x, i) => s + x * (i % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === d[12];
  };
  app.post<{ Body: { name: string; number: string; format?: LoyaltyCard['format'] } }>('/api/cards', (req, reply) =>
    guard(reply, 400, () => {
      const name = String(req.body?.name ?? '').trim() || 'Clubcard';
      const number = String(req.body?.number ?? '').trim().replace(/\s+/g, '');
      if (!number || number.length > 200) throw new Error('Enter or scan the card number');
      const format: LoyaltyCard['format'] = req.body?.format && ['EAN13', 'CODE128', 'QR'].includes(req.body.format)
        ? (req.body.format === 'EAN13' && !ean13ok(number) ? 'CODE128' : req.body.format)
        : ean13ok(number) ? 'EAN13' : 'CODE128';
      const card: LoyaltyCard = { id: newId(), name, number, format, createdAt: now() };
      store.update((db) => db.cards.push(card));
      return card;
    }),
  );
  app.delete<{ Params: { id: string } }>('/api/cards/:id', async (req) => {
    store.update((db) => {
      db.cards = db.cards.filter((c) => c.id !== req.params.id);
    });
    return { ok: true };
  });

  // ----- photos -----
  app.post('/api/photos', (req, reply) => guard(reply, 400, () => ({ id: photos.save(req.body as Buffer) })));
  app.get<{ Params: { file: string } }>('/api/photos/:file', async (req, reply) => {
    const jpg = photos.read(req.params.file.replace(/\.jpg$/, ''));
    if (!jpg) return reply.code(404).send({ error: 'Not found' });
    return reply.header('Cache-Control', 'public, max-age=31536000, immutable').type('image/jpeg').send(jpg);
  });
}
