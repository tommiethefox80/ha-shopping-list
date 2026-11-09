import { WebSocketServer, type WebSocket } from 'ws';
import type { HaTodoItem } from '../src/hasync.js';

/** A stand-in for Home Assistant's websocket API: auth, todo/item/subscribe and todo services. */
export async function startFakeHa(token = 'good') {
  const wss = new WebSocketServer({ port: 0 });
  await new Promise<void>((r) => wss.on('listening', () => r()));
  const lists = new Map<string, HaTodoItem[]>();
  const subs: { ws: WebSocket; id: number; entity: string }[] = [];
  const calls: string[] = [];
  let uid = 1;
  const list = (e: string) => {
    if (!lists.has(e)) lists.set(e, []);
    return lists.get(e)!;
  };
  const emit = (entity: string) => {
    for (const s of subs) if (s.entity === entity) s.ws.send(JSON.stringify({ id: s.id, type: 'event', event: { items: list(entity) } }));
  };
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'auth_required' }));
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === 'auth') return ws.send(JSON.stringify({ type: m.access_token === token ? 'auth_ok' : 'auth_invalid' }));
      if (m.type === 'todo/item/subscribe') {
        subs.push({ ws, id: m.id, entity: m.entity_id });
        ws.send(JSON.stringify({ id: m.id, type: 'result', success: true }));
        return emit(m.entity_id);
      }
      if (m.type === 'call_service') {
        const e = m.target.entity_id;
        const d = m.service_data;
        calls.push(`${m.service} ${JSON.stringify(d)}`);
        const items = list(e);
        if (m.service === 'add_item') items.push({ uid: String(uid++), summary: d.item, status: 'needs_action' });
        if (m.service === 'update_item') {
          const it = items.find((i) => i.uid === d.item);
          if (it && d.rename) it.summary = d.rename;
          if (it && d.status) it.status = d.status;
        }
        if (m.service === 'remove_item') lists.set(e, items.filter((i) => !d.item.includes(i.uid)));
        ws.send(JSON.stringify({ id: m.id, type: 'result', success: true }));
        return emit(e);
      }
    });
  });
  const port = (wss.address() as { port: number }).port;
  return {
    url: `ws://127.0.0.1:${port}`,
    calls,
    items: (e: string) => list(e),
    /** Simulate someone using Assist / Alexa / the HA card. */
    userAdd(e: string, summary: string) {
      list(e).push({ uid: String(uid++), summary, status: 'needs_action' });
      emit(e);
    },
    userUpdate(e: string, summary: string, change: Partial<HaTodoItem>) {
      const it = list(e).find((i) => i.summary === summary)!;
      Object.assign(it, change);
      emit(e);
    },
    userRemove(e: string, summary: string) {
      lists.set(e, list(e).filter((i) => i.summary !== summary));
      emit(e);
    },
    close: () => new Promise<void>((r) => wss.close(() => r())),
  };
}
