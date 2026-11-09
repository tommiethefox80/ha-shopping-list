import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Candidate, Product } from '../domain.js';
import { newId, now } from '../domain.js';
import type { ShoppingList } from '../list.js';
import { clampQty, normalize, parseTescoId } from '../matching.js';
import { lookupBarcode } from '../openfoodfacts.js';
import { decide, hasRule } from '../rules.js';
import { findProduct } from '../matching.js';
import type { Sender } from '../sender.js';
import type { Store } from '../store.js';
import type { TescoClient } from '../tesco/driver.js';

export interface Deps {
  store: Store;
  list: ShoppingList;
  sender: Sender;
  tesco: TescoClient;
  session: { signedIn: boolean | null; checkedAt?: string };
}

const fail = (reply: FastifyReply, code: number, e: unknown) => {
  const error = e instanceof Error ? e.message.split('\n')[0] : String(e);
  if (code >= 500) reply.log.error({ err: e }, error); // shows in the add-on's Log tab
  return reply.code(code).send({ error });
};

export async function apiRoutes(app: FastifyInstance, d: Deps) {
  const { store, list, sender, tesco, session } = d;
  const setSignedIn = (v: boolean) => Object.assign(session, { signedIn: v, checkedAt: now() });

  const state = () => ({
    items: store.data.items.map((i) => ({ ...i, resolved: list.resolve(i) })),
    products: store.data.products,
    job: sender.state,
    session,
  });

  app.get('/api/state', async () => state());

  // ----- list -----
  app.post<{ Body: { text?: string; name?: string; qty?: number; ean?: string; productId?: string; source?: string } }>(
    '/api/items',
    async (req, reply) => {
      try {
        return list.add({ ...req.body, source: req.body.source ?? 'app' });
      } catch (e) {
        return fail(reply, 400, e);
      }
    },
  );
  app.patch<{ Params: { id: string }; Body: { name?: string; qty?: number; productId?: string | null; status?: 'todo' | 'ticked' } }>(
    '/api/items/:id',
    async (req, reply) => {
      try {
        return list.update(req.params.id, req.body);
      } catch (e) {
        return fail(reply, 404, e);
      }
    },
  );
  app.delete<{ Params: { id: string } }>('/api/items/:id', async (req) => {
    list.remove(req.params.id);
    return { ok: true };
  });
  app.post('/api/items/clear-done', async () => ({ removed: list.clearDone() }));
  app.post<{ Params: { id: string }; Body: { candidate: Candidate; remember?: boolean } }>(
    '/api/items/:id/choose',
    async (req, reply) => {
      try {
        return list.choose(req.params.id, req.body.candidate, req.body.remember ?? true);
      } catch (e) {
        return fail(reply, 404, e);
      }
    },
  );
  app.post<{ Body: { productIds?: string[] } }>('/api/usuals/add', async (req) => list.addUsuals(req.body?.productIds));

  // ----- barcode -----
  app.post<{ Body: { ean: string } }>('/api/scan', async (req, reply) => {
    const ean = String(req.body?.ean ?? '').replace(/\D/g, '');
    if (!/^\d{8,14}$/.test(ean)) return fail(reply, 400, 'Not a product barcode');
    const known = store.data.products.find((p) => p.eans.includes(ean));
    if (known) return { matched: true, item: list.add({ productId: known.id, ean, source: 'scan' }) };
    const name = await lookupBarcode(ean);
    return { matched: false, lookedUp: name, item: list.add({ name: name ?? `Barcode ${ean}`, ean, source: 'scan' }) };
  });

  // ----- defaults / usuals -----
  type ProductBody = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>> & { tescoUrl?: string };
  const cleanList = (xs?: string[]) => [...new Set((xs ?? []).map((s) => s.trim()).filter(Boolean))];
  const cleanSwaps = (xs?: { tescoId: string; tescoName: string }[]) =>
    (xs ?? [])
      .map((x) => ({ tescoId: parseTescoId(String(x.tescoId)) ?? '', tescoName: String(x.tescoName ?? '').trim() }))
      .filter((x) => x.tescoId && x.tescoName);

  app.post<{ Body: ProductBody }>('/api/products', async (req, reply) => {
    const b = req.body;
    const tescoId = parseTescoId(b.tescoId ?? b.tescoUrl ?? '');
    if (!tescoId) return fail(reply, 400, 'Need a Tesco product link or ID');
    let tescoName = b.tescoName;
    let { price, imageUrl } = b;
    if (!tescoName) {
      const found = await tesco.product(tescoId).catch(() => null);
      if (!found) return fail(reply, 404, 'Could not find that product on Tesco');
      tescoName = found.name;
      price ??= found.price;
      imageUrl ??= found.imageUrl;
    }
    const label = (b.label ?? '').trim() || tescoName;
    const clash = store.data.products.find((p) =>
      [p.label, ...p.aliases].some((n) => [label, ...(b.aliases ?? [])].some((m) => normalize(m) === normalize(n))),
    );
    if (clash) return fail(reply, 409, `"${clash.label}" already uses that name`);
    const t = now();
    const product: Product = {
      id: newId(), label, aliases: cleanList(b.aliases), tescoId, tescoName, price, imageUrl,
      eans: cleanList(b.eans), defaultQty: clampQty(b.defaultQty ?? 1), usual: !!b.usual, createdAt: t, updatedAt: t,
      offerSwaps: cleanSwaps(b.offerSwaps),
    };
    store.update((db) => db.products.push(product));
    return product;
  });

  app.patch<{ Params: { id: string }; Body: ProductBody }>('/api/products/:id', async (req, reply) => {
    const b = req.body;
    try {
      let lookup: Candidate | null = null;
      const newTescoId = b.tescoId || b.tescoUrl ? parseTescoId(b.tescoId ?? b.tescoUrl ?? '') : undefined;
      if ((b.tescoId || b.tescoUrl) && !newTescoId) return fail(reply, 400, 'Need a Tesco product link or ID');
      if (newTescoId && !b.tescoName) lookup = await tesco.product(newTescoId).catch(() => null);
      return store.update((db) => {
        const p = db.products.find((x) => x.id === req.params.id);
        if (!p) throw new Error('Not found');
        if (b.label?.trim()) p.label = b.label.trim();
        if (b.aliases) p.aliases = cleanList(b.aliases);
        if (b.eans) p.eans = cleanList(b.eans);
        if (b.defaultQty !== undefined) p.defaultQty = clampQty(b.defaultQty);
        if (b.usual !== undefined) p.usual = !!b.usual;
        if (b.offerSwaps !== undefined) p.offerSwaps = cleanSwaps(b.offerSwaps);
        if (newTescoId) {
          p.tescoId = newTescoId;
          p.tescoName = b.tescoName ?? lookup?.name ?? p.tescoName;
          p.price = b.price ?? lookup?.price;
          p.imageUrl = b.imageUrl ?? lookup?.imageUrl;
        }
        p.updatedAt = now();
        return p;
      });
    } catch (e) {
      return fail(reply, 404, e);
    }
  });

  app.delete<{ Params: { id: string } }>('/api/products/:id', async (req) => {
    store.update((db) => {
      db.products = db.products.filter((p) => p.id !== req.params.id);
      for (const i of db.items) if (i.productId === req.params.id) i.productId = undefined;
    });
    return { ok: true };
  });

  // ----- Tesco lookups (use the background browser) -----
  app.get<{ Querystring: { q: string } }>('/api/tesco/search', async (req, reply) => {
    const q = (req.query.q ?? '').trim();
    if (!q) return [];
    try {
      return await tesco.search(q, 12);
    } catch (e) {
      return fail(reply, 502, e);
    }
  });

  // ----- send -----
  // Items whose product has a rule: check offers now so the review sheet can show the choice.
  app.post<{ Body: { itemIds?: string[] } }>('/api/send/plan', async (req, reply) => {
    if (sender.state.running) return fail(reply, 409, 'A send is already running');
    const open = store.data.items.filter(
      (i) => ['todo', 'error', 'unavailable'].includes(i.status) && (!req.body?.itemIds || req.body.itemIds.includes(i.id)),
    );
    const out = [];
    try {
      for (const item of open) {
        if (item.oneOffTescoId) continue;
        const product = findProduct(store.data.products, item);
        if (!hasRule(product)) continue;
        const d = await decide(product, tesco, true);
        out.push({ itemId: item.id, itemName: item.name, qty: item.qty, chosen: d.tescoId, reason: d.reason, options: d.options });
      }
      return out;
    } catch (e) {
      return fail(reply, 502, e);
    }
  });

  app.post<{ Body: { itemIds?: string[]; choices?: Record<string, string> } }>('/api/send', async (req, reply) => {
    try {
      return sender.start(req.body?.itemIds, req.body?.choices ?? {});
    } catch (e) {
      return fail(reply, 409, e);
    }
  });
  app.get('/api/send', async () => sender.state);
  app.post('/api/send/cancel', async () => {
    sender.cancel();
    return sender.state;
  });

  // ----- Tesco sign-in viewer -----
  app.get('/api/session', async () => session);
  app.post('/api/session/check', async (_req, reply) => {
    try {
      setSignedIn(await tesco.isSignedIn());
      return session;
    } catch (e) {
      return fail(reply, 502, e);
    }
  });
  app.post('/api/session/open', async (_req, reply) => {
    try {
      await tesco.openSignIn();
      return { ok: true };
    } catch (e) {
      return fail(reply, 502, e);
    }
  });
  app.get('/api/session/screen.jpg', async (_req, reply) => {
    try {
      const jpg = await tesco.screenshot();
      return reply.header('Cache-Control', 'no-store').type('image/jpeg').send(jpg);
    } catch (e) {
      return fail(reply, 503, e);
    }
  });
  app.post<{ Body: { x: number; y: number } }>('/api/session/click', async (req) => {
    await tesco.click(Number(req.body.x), Number(req.body.y));
    return { ok: true };
  });
  app.post<{ Body: { text: string } }>('/api/session/type', async (req) => {
    await tesco.type(String(req.body.text ?? '').slice(0, 200));
    return { ok: true };
  });
  app.post<{ Body: { key: string } }>('/api/session/key', async (req) => {
    await tesco.press(String(req.body.key ?? ''));
    return { ok: true };
  });
}
