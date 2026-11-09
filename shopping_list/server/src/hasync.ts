import type { HaLink, Item } from './domain.js';
import type { ShoppingList } from './list.js';
import { parseItemText } from './matching.js';
import type { Store } from './store.js';

/** One item as Home Assistant's to-do websocket reports it. */
export interface HaTodoItem {
  uid: string;
  summary: string;
  status: 'needs_action' | 'completed';
}

export interface HaSyncOptions {
  /** ws(s)://…/api/websocket */
  url: string;
  token: string;
  /** e.g. ["todo.shopping_list", "todo.alexa_shopping_list"] */
  entities: string[];
  /** Name of our list to mirror (default: the first list). */
  listName?: string;
  log?: (msg: string) => void;
}

/** How one of our items appears in Home Assistant: "beans" or "beans ×2". */
export const render = (i: Pick<Item, 'name' | 'qty'>) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name);
const haStatus = (i: Item): HaLink['status'] => (i.status === 'ticked' ? 'completed' : 'needs_action');

type Call = { type: 'call_service'; domain: 'todo'; service: string; target: { entity_id: string }; service_data: Record<string, unknown> };

/**
 * Two-way sync between one of our lists and Home Assistant to-do lists.
 *
 * For each HA item we remember what we last agreed (summary + status). On every change from
 * either side we compare three ways: if HA differs from what we agreed, HA changed it and we
 * apply that here; otherwise if our item differs, we push our change to HA. New HA items are
 * added to our list (that's how Assist / Alexa additions arrive); new items of ours are added
 * to HA. Our app stays the source of truth for quantity and product details.
 */
export class HaSync {
  private ws?: WebSocket;
  private nextId = 1;
  private pending = new Map<number, (r: { success: boolean; result?: unknown; error?: { message: string } }) => void>();
  private snapshots = new Map<string, HaTodoItem[]>();
  /** Summaries we've asked HA to add, waiting to learn their uid: entity -> summary -> itemIds. */
  private adding = new Map<string, Map<string, string[]>>();
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private retryMs = 2000;
  private unsubscribeStore?: () => void;
  connected = false;
  lastError?: string;

  constructor(
    private readonly store: Store,
    private readonly list: ShoppingList,
    private readonly opts: HaSyncOptions,
  ) {}

  start() {
    this.unsubscribeStore = this.store.subscribe(() => this.schedule());
    this.connect();
  }

  status() {
    return { connected: this.connected, entities: this.opts.entities, error: this.lastError };
  }

  stop() {
    this.stopped = true;
    this.unsubscribeStore?.();
    clearTimeout(this.timer);
    this.ws?.close();
  }

  private log(msg: string) {
    this.opts.log?.(msg);
  }

  private listId(): string {
    const lists = this.store.data.lists;
    const byName = this.opts.listName ? lists.find((l) => l.name.toLowerCase() === this.opts.listName!.toLowerCase()) : undefined;
    return (byName ?? lists[0]).id;
  }

  // ---------- transport ----------

  private connect() {
    if (this.stopped) return;
    const ws = new WebSocket(this.opts.url);
    this.ws = ws;
    ws.onmessage = (ev) => this.onMessage(JSON.parse(String(ev.data)));
    ws.onclose = () => {
      this.connected = false;
      this.pending.forEach((r) => r({ success: false, error: { message: 'disconnected' } }));
      this.pending.clear();
      if (!this.stopped) {
        setTimeout(() => this.connect(), this.retryMs);
        this.retryMs = Math.min(this.retryMs * 2, 60_000);
      }
    };
    ws.onerror = () => {
      this.lastError = `Can't reach Home Assistant at ${this.opts.url}`;
    };
  }

  private send(msg: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (r) => (r.success ? resolve(r.result) : reject(new Error(r.error?.message ?? 'failed'))));
      this.ws?.send(JSON.stringify({ id, ...msg }));
    });
  }

  private onMessage(m: { type: string; id?: number; success?: boolean; result?: unknown; error?: { message: string }; event?: { items?: HaTodoItem[] } }) {
    if (m.type === 'auth_required') {
      this.ws?.send(JSON.stringify({ type: 'auth', access_token: this.opts.token }));
    } else if (m.type === 'auth_invalid') {
      this.lastError = 'Home Assistant refused the access token';
      this.log(this.lastError);
      this.stopped = true;
      this.ws?.close();
    } else if (m.type === 'auth_ok') {
      this.connected = true;
      this.lastError = undefined;
      this.retryMs = 2000;
      this.log(`Connected to Home Assistant; syncing ${this.opts.entities.join(', ')}`);
      for (const entity of this.opts.entities) {
        const id = this.nextId++;
        this.pending.set(id, (r) => {
          if (!r.success) {
            this.lastError = `Can't follow ${entity}: ${r.error?.message}`;
            this.log(this.lastError);
          }
        });
        this.ws?.send(JSON.stringify({ id, type: 'todo/item/subscribe', entity_id: entity }));
        this.subscriptions.set(id, entity);
      }
    } else if (m.type === 'result' && m.id !== undefined) {
      this.pending.get(m.id)?.({ success: !!m.success, result: m.result, error: m.error });
      this.pending.delete(m.id);
    } else if (m.type === 'event' && m.id !== undefined && m.event?.items) {
      const entity = this.subscriptions.get(m.id);
      if (entity) {
        this.snapshots.set(entity, m.event.items);
        this.schedule(0);
      }
    }
  }

  private subscriptions = new Map<number, string>();

  private call(entity: string, service: string, data: Record<string, unknown>) {
    const msg: Omit<Call, 'id'> = { type: 'call_service', domain: 'todo', service, target: { entity_id: entity }, service_data: data };
    return this.send(msg).catch((e: Error) => this.log(`${entity} ${service} failed: ${e.message}`));
  }

  // ---------- reconcile ----------

  private schedule(ms = 300) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.reconcileAll(), ms);
  }

  private running = false;
  private again = false;

  private async reconcileAll() {
    if (this.running) {
      this.again = true;
      return;
    }
    this.running = true;
    try {
      for (const [entity, items] of this.snapshots) await this.reconcile(entity, items);
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        this.schedule(0);
      }
    }
  }

  /** Bring one HA to-do list and our list into agreement. Exposed for tests. */
  async reconcile(entity: string, haItems: HaTodoItem[]) {
    if (!this.connected) return;
    const listId = this.listId();
    const who = /alexa/i.test(entity) ? 'Alexa' : 'Home Assistant';
    const links = () => (this.store.data.haSync[entity]?.links ?? {}) as Record<string, HaLink>;
    const setLink = (uid: string, link?: HaLink) =>
      this.store.update((db) => {
        db.haSync[entity] ??= { links: {} };
        if (link) db.haSync[entity].links[uid] = link;
        else delete db.haSync[entity].links[uid];
      });
    const item = (id: string) => this.store.data.items.find((i) => i.id === id);
    const adding = this.adding.get(entity) ?? new Map<string, string[]>();
    this.adding.set(entity, adding);
    const calls: Promise<unknown>[] = [];

    const seen = new Set<string>();
    for (const ha of haItems) {
      seen.add(ha.uid);
      const link = links()[ha.uid];

      if (!link) {
        // An item we asked HA to add, coming back with its new uid?
        const waiting = adding.get(ha.summary);
        if (waiting?.length) {
          const itemId = waiting.shift()!;
          if (item(itemId)) setLink(ha.uid, { itemId, summary: ha.summary, status: ha.status });
          else calls.push(this.call(entity, 'remove_item', { item: [ha.uid] })); // deleted here meanwhile
          continue;
        }
        if (ha.status === 'completed') continue; // old ticked item we never knew about
        // New from HA (Assist, Alexa, the HA to-do card): add to our list.
        const before = new Set(Object.values(links()).map((l) => l.itemId));
        const added = this.list.add({ text: ha.summary, listId, source: entity }, who);
        if (before.has(added.id)) {
          // Merged into something already mirrored (e.g. "milk" when milk is on the list):
          // drop the duplicate in HA; the merged quantity gets pushed below.
          calls.push(this.call(entity, 'remove_item', { item: [ha.uid] }));
        } else {
          setLink(ha.uid, { itemId: added.id, summary: ha.summary, status: 'needs_action' });
        }
        continue;
      }

      const ours = item(link.itemId);
      if (!ours || ours.listId !== listId) {
        // Removed (or moved to another list) on our side.
        calls.push(this.call(entity, 'remove_item', { item: [ha.uid] }));
        setLink(ha.uid);
        continue;
      }

      const haChanged = ha.summary !== link.summary || ha.status !== link.status;
      if (haChanged) {
        // HA wins for what it changed.
        if (ha.summary !== link.summary) {
          const p = parseItemText(ha.summary);
          this.list.update(ours.id, { name: p.name, qty: p.qty }, who);
        }
        if (ha.status !== link.status) this.list.update(ours.id, { status: ha.status === 'completed' ? 'ticked' : 'todo' }, who);
        const now = item(ours.id)!;
        setLink(ha.uid, { itemId: ours.id, summary: ha.summary, status: ha.status });
        // Our rendering may differ (e.g. merged quantity); push it back if so.
        if (render(now) !== ha.summary) {
          calls.push(this.call(entity, 'update_item', { item: ha.uid, rename: render(now) }));
          setLink(ha.uid, { itemId: ours.id, summary: render(now), status: ha.status });
        }
        continue;
      }

      // HA unchanged since we last agreed: push our changes, if any.
      const want = { summary: render(ours), status: haStatus(ours) };
      if (want.summary !== link.summary || want.status !== link.status) {
        const data: Record<string, unknown> = { item: ha.uid };
        if (want.summary !== link.summary) data.rename = want.summary;
        if (want.status !== link.status) data.status = want.status;
        calls.push(this.call(entity, 'update_item', data));
        setLink(ha.uid, { itemId: ours.id, ...want });
      }
    }

    // Links whose HA item has gone: removed in HA -> remove ours (if still to get).
    for (const [uid, link] of Object.entries(links())) {
      if (seen.has(uid)) continue;
      const ours = item(link.itemId);
      if (ours && ours.status === 'todo' && ours.listId === listId) this.list.remove(ours.id, who);
      setLink(uid);
    }

    // Our open items HA doesn't have yet: add them.
    const linked = new Set(Object.values(links()).map((l) => l.itemId));
    const waitingIds = new Set([...adding.values()].flat());
    for (const ours of this.store.data.items) {
      if (ours.listId !== listId || ours.status !== 'todo' || linked.has(ours.id) || waitingIds.has(ours.id)) continue;
      const summary = render(ours);
      adding.set(summary, [...(adding.get(summary) ?? []), ours.id]);
      calls.push(this.call(entity, 'add_item', { item: summary }));
    }
    await Promise.all(calls);
  }
}
