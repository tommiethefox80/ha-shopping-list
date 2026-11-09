import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import type { Config } from './config.js';
import { ShoppingList } from './list.js';
import type { BarcodeInfo } from './openfoodfacts.js';
import { apiRoutes } from './routes/api.js';
import type { Store } from './store.js';

const INGRESS_IP = '172.30.32.2';
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export async function buildApp(
  cfg: Config,
  store: Store,
  opts: { logger?: boolean; barcodeLookup?: (ean: string) => Promise<BarcodeInfo | undefined> } = {},
) {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: 'info', serializers: { req: (r) => ({ method: r.method, url: r.url }) } },
  });
  const list = new ShoppingList(store);

  // Home Assistant ingress is already authenticated. Anything else (e.g. a rest_command
  // from HA on the internal network) needs the API token, if one is configured.
  app.addHook('onRequest', async (req, reply) => {
    if (!cfg.apiToken || !req.url.startsWith('/api/')) return;
    if (req.ip === INGRESS_IP || LOOPBACK.has(req.ip)) return;
    if (req.headers.authorization !== `Bearer ${cfg.apiToken}`) {
      return reply.code(401).send({ error: 'Unauthorised' });
    }
  });

  await apiRoutes(app, { store, list, barcodeLookup: opts.barcodeLookup });

  if (existsSync(cfg.webDir)) {
    await app.register(fastifyStatic, { root: cfg.webDir, prefix: '/' });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Not found' }) : reply.sendFile('index.html'),
    );
  }
  return { app, list };
}
