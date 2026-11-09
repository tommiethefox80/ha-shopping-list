import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { defaultProducts, Store } from './store.js';

const cfg = loadConfig();
const store = new Store(cfg.dataDir, defaultProducts);
const { app } = await buildApp(cfg, store);

const shutdown = async () => {
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ host: '0.0.0.0', port: cfg.port });
