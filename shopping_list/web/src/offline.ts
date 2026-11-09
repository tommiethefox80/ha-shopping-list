import type { QueuedCall } from './api';
import type { AppState, Item } from './types';

const CACHE = 'lastState';

export function cacheState(s: AppState) {
  try {
    localStorage.setItem(CACHE, JSON.stringify(s));
  } catch {
    /* full or unavailable */
  }
}

export function cachedState(): AppState | undefined {
  try {
    const raw = localStorage.getItem(CACHE);
    return raw ? (JSON.parse(raw) as AppState) : undefined;
  } catch {
    return undefined;
  }
}

/** Shows queued (not yet sent) changes on top of the last known state. */
export function applyOutbox(state: AppState, queue: QueuedCall[]): AppState {
  if (!queue.length) return state;
  let items = state.items.map((i) => ({ ...i }));
  for (const q of queue) {
    const m = q.path.match(/^items\/([^/]+)$/);
    const b = (q.body ?? {}) as Record<string, unknown>;
    if (m && q.method === 'PATCH') {
      const it = items.find((i) => i.id === m[1]);
      if (!it) continue;
      if (b.status === 'ticked' || b.status === 'todo') {
        it.status = b.status;
        it.tickedAt = b.status === 'ticked' ? new Date(q.at).toISOString() : undefined;
      }
      if (typeof b.qty === 'number') it.qty = b.qty;
      if (typeof b.name === 'string' && b.name.trim()) it.name = b.name.trim();
      if (typeof b.note === 'string') it.note = b.note || undefined;
    } else if (m && q.method === 'DELETE') {
      items = items.filter((i) => i.id !== m[1]);
    } else if (q.path === 'items' && q.method === 'POST') {
      const text = String(b.text ?? b.name ?? '').trim();
      if (!text) continue;
      const pending: Item = {
        id: `pending-${q.id}`,
        listId: String(b.listId ?? state.lists[0]?.id),
        name: `${text} ⏳`,
        qty: Number(b.qty ?? 1),
        status: 'todo',
        createdAt: new Date(q.at).toISOString(),
        resolved: { categoryId: 'other' },
      };
      items.push(pending);
    } else if (/^lists\/[^/]+\/clear-done$/.test(q.path)) {
      const listId = q.path.split('/')[1];
      items = items.filter((i) => !(i.listId === listId && i.status === 'ticked'));
    }
  }
  return { ...state, items };
}
