import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { HaSync } from './hasync.js';
import { defaultProducts, Store } from './store.js';

const cfg = loadConfig();
const store = new Store(cfg.dataDir, defaultProducts);
const { app, list } = await buildApp(cfg, store, { haStatus: () => sync?.status() });

let sync: HaSync | undefined;
if (cfg.ha) {
  sync = new HaSync(store, list, { ...cfg.ha, log: (m) => app.log.info(m) });
  sync.start();
} else {
  app.log.info('Home Assistant to-do sync is off (set ha_todo_entities to turn it on)');
}

const shutdown = async () => {
  sync?.stop();
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

await app.listen({ host: '0.0.0.0', port: cfg.port });
