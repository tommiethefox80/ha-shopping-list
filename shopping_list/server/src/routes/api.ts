import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Product } from '../domain.js';
import { newId, now } from '../domain.js';
import type { ShoppingList } from '../list.js';
import { clampQty, normalize } from '../matching.js';
import { lookupBarcode, type BarcodeInfo } from '../openfoodfacts.js';
import type { Store } from '../store.js';

export interface Deps {
  store: Store;
  list: ShoppingList;
  barcodeLookup?: (ean: string) => Promise<BarcodeInfo | undefined>;
}

const fail = (reply: FastifyReply, code: number, e: unknown) => {
  const error = e instanceof Error ? e.message.split('\n')[0] : String(e);
  if (code >= 500) reply.log.error({ err: e }, error);
  return reply.code(code).send({ error });
};

export async function apiRoutes(app: FastifyInstance, d: Deps) {
  const { store, list } = d;
  const lookup = d.barcodeLookup ?? lookupBarcode;

  app.get('/api/state', async () => ({
    items: store.data.items.map((i) => ({ ...i, resolved: list.resolve(i) })),
    products: store.data.products,
  }));

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
  app.post<{ Body: { productIds?: string[] } }>('/api/usuals/add', async (req) => list.addUsuals(req.body?.productIds));

  // ----- barcode -----
  // Known barcode -> that product. Unknown -> look it up, save it as a product (so the next scan
  // is instant) and add it to the list.
  app.post<{ Body: { ean: string } }>('/api/scan', async (req, reply) => {
    const ean = String(req.body?.ean ?? '').replace(/\D/g, '');
    if (!/^\d{8,14}$/.test(ean)) return fail(reply, 400, 'Not a product barcode');
    const known = store.data.products.find((p) => p.eans.includes(ean));
    if (known) return { matched: true, item: list.add({ productId: known.id, ean, source: 'scan' }) };
    const info = await lookup(ean);
    if (!info) return { matched: false, item: list.add({ name: `Barcode ${ean}`, ean, source: 'scan' }) };
    const t = now();
    const product: Product = {
      id: newId(), label: info.name, aliases: [], detail: info.name, imageUrl: info.imageUrl,
      eans: [ean], defaultQty: 1, usual: false, createdAt: t, updatedAt: t,
    };
    store.update((db) => db.products.push(product));
    return { matched: false, lookedUp: info.name, item: list.add({ productId: product.id, ean, source: 'scan' }) };
  });

  // ----- products -----
  type ProductBody = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>;
  const cleanList = (xs?: string[]) => [...new Set((xs ?? []).map((s) => s.trim()).filter(Boolean))];

  app.post<{ Body: ProductBody }>('/api/products', async (req, reply) => {
    const b = req.body;
    const label = (b.label ?? '').trim();
    if (!label) return fail(reply, 400, 'A name is required');
    const clash = store.data.products.find((p) =>
      [p.label, ...p.aliases].some((n) => [label, ...(b.aliases ?? [])].some((m) => normalize(m) === normalize(n))),
    );
    if (clash) return fail(reply, 409, `"${clash.label}" already uses that name`);
    const t = now();
    const product: Product = {
      id: newId(), label, aliases: cleanList(b.aliases), detail: b.detail?.trim() || undefined, imageUrl: b.imageUrl,
      eans: cleanList(b.eans), defaultQty: clampQty(b.defaultQty ?? 1), usual: !!b.usual, createdAt: t, updatedAt: t,
    };
    store.update((db) => db.products.push(product));
    return product;
  });

  app.patch<{ Params: { id: string }; Body: ProductBody }>('/api/products/:id', async (req, reply) => {
    const b = req.body;
    try {
      return store.update((db) => {
        const p = db.products.find((x) => x.id === req.params.id);
        if (!p) throw new Error('Not found');
        if (b.label?.trim()) p.label = b.label.trim();
        if (b.aliases) p.aliases = cleanList(b.aliases);
        if (b.detail !== undefined) p.detail = b.detail?.trim() || undefined;
        if (b.imageUrl !== undefined) p.imageUrl = b.imageUrl || undefined;
        if (b.eans) p.eans = cleanList(b.eans);
        if (b.defaultQty !== undefined) p.defaultQty = clampQty(b.defaultQty);
        if (b.usual !== undefined) p.usual = !!b.usual;
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
}
