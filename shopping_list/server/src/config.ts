import { existsSync, readFileSync } from 'node:fs';

export interface Config {
  port: number;
  dataDir: string;
  baseUrl: string;
  headless: boolean;
  apiToken: string;
  chromePath?: string;
  minDelayMs: number;
  maxDelayMs: number;
  webDir: string;
}

function bool(v: unknown, fallback: boolean): boolean {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  return /^(1|true|yes|on)$/i.test(String(v));
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
    baseUrl: String(env.TESCO_BASE_URL ?? opts.tesco_base_url ?? 'https://www.tesco.com').replace(/\/$/, ''),
    headless: bool(env.HEADLESS ?? opts.headless, false),
    apiToken: String(env.API_TOKEN ?? opts.api_token ?? ''),
    chromePath: env.CHROME_PATH || undefined,
    minDelayMs: Number(env.MIN_DELAY_MS ?? 1500),
    maxDelayMs: Number(env.MAX_DELAY_MS ?? 3500),
    webDir: env.WEB_DIR ?? new URL('../../web/dist', import.meta.url).pathname,
  };
}
