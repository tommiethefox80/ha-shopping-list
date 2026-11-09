import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { defaultProducts, Store } from './store.js';
import { TescoDriver } from './tesco/driver.js';

const cfg = loadConfig();
const store = new Store(cfg.dataDir, defaultProducts);
const tesco = new TescoDriver({ baseUrl: cfg.baseUrl, dataDir: cfg.dataDir, headless: cfg.headless, chromePath: cfg.chromePath });
const { app } = await buildApp(cfg, store, tesco);

const shutdown = async () => {
  await app.close();
  await tesco.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ host: '0.0.0.0', port: cfg.port });
