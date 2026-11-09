import { existsSync, readFileSync } from 'node:fs';

export interface Config {
  port: number;
  dataDir: string;
  apiToken: string;
  webDir: string;
}

/** Reads Home Assistant add-on options (/data/options.json) with env-var overrides. */
export function loadConfig(): Config {
  const env = process.env;
  const optionsPath = env.OPTIONS_PATH ?? '/data/options.json';
  let opts: Record<string, unknown> = {};
  if (existsSync(optionsPath)) {
    try {
      opts = JSON.parse(readFileSync(optionsPath, 'utf8'));
    } catch {
      /* ignore malformed options */
    }
  }
  return {
    port: Number(env.PORT ?? 8099),
    dataDir: env.DATA_DIR ?? (existsSync('/data') ? '/data' : './data'),
    apiToken: String(env.API_TOKEN ?? opts.api_token ?? ''),
    webDir: env.WEB_DIR ?? new URL('../../web/dist', import.meta.url).pathname,
  };
}
