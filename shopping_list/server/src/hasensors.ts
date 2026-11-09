import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './domain.js';
import type { Store } from './store.js';

export interface HaSensorOptions {
  /** e.g. http://supervisor/core/api or http://homeassistant.local:8123/api */
  apiUrl: string;
  token: string;
  dataDir: string;
  /** Where HA serves /local from (…/www). Uploaded recipe photos are copied there for the card. */
  wwwDir?: string;
  timeZone?: string;
  log?: (msg: string) => void;
  fetcher?: typeof fetch;
}

const DAY = 86_400_000;
const dayIn = (tz: string, offsetDays = 0) => new Date(Date.now() + offsetDays * DAY).toLocaleDateString('en-CA', { timeZone: tz });

/** What a day's meal looks like on the dashboard. */
function describe(db: Db, date: string) {
  const m = db.meals[date];
  const r = m?.recipeId ? db.recipes.find((x) => x.id === m.recipeId) : undefined;
  return { meal: r?.name ?? m?.text ?? null, recipe: r, servings: m?.servings ?? r?.servings };
}

/**
 * Publishes sensor.tonights_dinner and sensor.shopping_list_items to Home Assistant, so a
 * dashboard card needs no YAML sensors. Re-sent when anything changes, at midnight, and every
 * 10 minutes (HA forgets API-set states when it restarts).
 */
export class HaSensors {
  private timer?: NodeJS.Timeout;
  private ticker?: NodeJS.Timeout;
  private last = new Map<string, string>();
  private lastForced = 0;
  private off?: () => void;

  constructor(private readonly store: Store, private readonly opts: HaSensorOptions) {}

  start() {
    this.off = this.store.subscribe(() => this.schedule());
    this.ticker = setInterval(() => void this.publish(), 60_000);
    this.schedule(500);
  }

  stop() {
    this.off?.();
    clearTimeout(this.timer);
    clearInterval(this.ticker);
  }

  private schedule(ms = 1500) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.publish(), ms);
  }

  /** Copies an uploaded photo into HA's www folder and returns its /local URL. */
  private picture(r?: { photo?: string; imageUrl?: string }): string | undefined {
    if (r?.photo && this.opts.wwwDir) {
      try {
        const dir = join(this.opts.wwwDir, 'shopping_list');
        mkdirSync(dir, { recursive: true });
        const dest = join(dir, `${r.photo}.jpg`);
        if (!existsSync(dest)) copyFileSync(join(this.opts.dataDir, 'photos', `${r.photo}.jpg`), dest);
        return `/local/shopping_list/${r.photo}.jpg`;
      } catch {
        /* fall back to the web image */
      }
    }
    return r?.imageUrl;
  }

  /** The sensors' current states (exported for tests). */
  states() {
    const db = this.store.data;
    const tz = this.opts.timeZone ?? process.env.TZ ?? 'Europe/London';
    const today = dayIn(tz);
    const tonight = describe(db, today);
    const tomorrow = describe(db, dayIn(tz, 1));
    const total = (tonight.recipe?.prepMinutes ?? 0) + (tonight.recipe?.cookMinutes ?? 0);
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = dayIn(tz, i);
      const x = describe(db, d);
      return { date: d, day: new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' }), meal: x.meal };
    });
    const open = db.items.filter((i) => i.status === 'todo');
    return {
      'sensor.tonights_dinner': {
        state: tonight.meal ?? 'Nothing planned',
        attributes: {
          friendly_name: "Tonight's dinner",
          icon: 'mdi:silverware-fork-knife',
          entity_picture: this.picture(tonight.recipe),
          planned: !!tonight.meal,
          recipe: tonight.recipe?.name ?? null,
          description: tonight.recipe?.description ?? null,
          servings: tonight.servings ?? null,
          prep_minutes: tonight.recipe?.prepMinutes ?? null,
          cook_minutes: tonight.recipe?.cookMinutes ?? null,
          total_minutes: total || null,
          tags: tonight.recipe?.tags ?? [],
          tomorrow: tomorrow.meal,
          week,
        },
      },
      'sensor.shopping_list_items': {
        state: String(open.length),
        attributes: {
          friendly_name: 'Shopping list',
          icon: 'mdi:cart-outline',
          unit_of_measurement: 'items',
          lists: db.lists.map((l) => ({ name: l.name, to_get: open.filter((i) => i.listId === l.id).length })),
          items: open.slice(0, 50).map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)),
        },
      },
    };
  }

  async publish() {
    const force = Date.now() - this.lastForced > 10 * 60_000;
    if (force) this.lastForced = Date.now();
    const f = this.opts.fetcher ?? fetch;
    for (const [entity, body] of Object.entries(this.states())) {
      const json = JSON.stringify(body);
      if (!force && this.last.get(entity) === json) continue;
      try {
        const res = await f(`${this.opts.apiUrl}/states/${entity}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.opts.token}`, 'Content-Type': 'application/json' },
          body: json,
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.last.set(entity, json);
      } catch (e) {
        this.last.delete(entity);
        this.opts.log?.(`Couldn't update ${entity} in Home Assistant: ${(e as Error).message}`);
      }
    }
  }
}
