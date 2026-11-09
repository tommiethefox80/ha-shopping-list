import { existsSync, readFileSync } from 'node:fs';

export interface Config {
  port: number;
  dataDir: string;
  apiToken: string;
  webDir: string;
  ha?: { url: string; token: string; entities: string[]; listName?: string };
  /** Home Assistant REST API, for publishing the dinner / list sensors. */
  haApi?: { apiUrl: string; token: string; wwwDir?: string };
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
  const entities = (
    env.HA_TODO_ENTITIES ? env.HA_TODO_ENTITIES.split(',') : ((opts.ha_todo_entities as string[] | undefined) ?? [])
  ).map((e) => e.trim()).filter((e) => /^todo\.[a-z0-9_]+$/.test(e));
  // Inside Home Assistant the Supervisor gives us a token; elsewhere (e.g. Docker on the NUC)
  // set ha_url + ha_token (a long-lived access token).
  const supervisorToken = env.SUPERVISOR_TOKEN;
  const haUrl = String(env.HA_URL ?? opts.ha_url ?? '');
  const haToken = String(env.HA_TOKEN ?? opts.ha_token ?? '');
  const ha =
    entities.length && supervisorToken
      ? { url: 'ws://supervisor/core/websocket', token: supervisorToken }
      : entities.length && haUrl && haToken
        ? { url: haUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/api/websocket', token: haToken }
        : undefined;
  const sensorsOn = String(env.HA_SENSORS ?? opts.ha_sensors ?? 'true') !== 'false';
  const haApi = !sensorsOn
    ? undefined
    : supervisorToken
      ? { apiUrl: 'http://supervisor/core/api', token: supervisorToken }
      : haUrl && haToken
        ? { apiUrl: haUrl.replace(/\/$/, '') + '/api', token: haToken }
        : undefined;
  const wwwDir = ['/homeassistant/www', '/config/www'].find((d) => existsSync(d.replace(/\/www$/, '')));
  return {
    haApi: haApi && { ...haApi, wwwDir },
    ha: ha && { ...ha, entities, listName: String(env.HA_SYNC_LIST ?? opts.ha_sync_list ?? '') || undefined },
    port: Number(env.PORT ?? 8099),
    dataDir: env.DATA_DIR ?? (existsSync('/data') ? '/data' : './data'),
    apiToken: String(env.API_TOKEN ?? opts.api_token ?? ''),
    webDir: env.WEB_DIR ?? new URL('../../web/dist', import.meta.url).pathname,
  };
}
