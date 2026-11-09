// Relative URLs so the app works behind Home Assistant ingress.
//
// Offline: if a change can't reach the add-on (no signal in the shop), it's kept in an outbox
// on the phone and sent, in order, when the connection comes back. The UI shows queued changes
// straight away (see applyOutbox).

export interface QueuedCall {
  id: string;
  method: string;
  path: string;
  body?: unknown;
  at: number;
}

export class QueuedOffline extends Error {
  constructor() {
    super('No signal — saved on this phone, will sync when back online');
  }
}

const OUTBOX = 'outbox';
const load = (): QueuedCall[] => {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? '[]');
  } catch {
    return [];
  }
};
const save = (q: QueuedCall[]) => {
  try {
    localStorage.setItem(OUTBOX, JSON.stringify(q));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l(q));
};
const listeners = new Set<(q: QueuedCall[]) => void>();
export const outbox = {
  get: load,
  subscribe(fn: (q: QueuedCall[]) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`api/${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data as { error?: string }).error ?? `HTTP ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

const unreachable = (e: unknown) => e instanceof TypeError || [502, 503, 504].includes((e as { status?: number }).status ?? 0);

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (method === 'GET') return send<T>(method, path, body);
  // Keep order: if things are already waiting, join the queue.
  if (load().length === 0) {
    try {
      return await send<T>(method, path, body);
    } catch (e) {
      if (!unreachable(e)) throw e;
    }
  }
  save([...load(), { id: crypto.randomUUID(), method, path, body, at: Date.now() }]);
  void flushOutbox();
  throw new QueuedOffline();
}

let flushing = false;
/** Sends queued changes in order. Returns true when the outbox is empty. */
export async function flushOutbox(): Promise<boolean> {
  if (flushing) return load().length === 0;
  flushing = true;
  try {
    for (;;) {
      const [next, ...rest] = load();
      if (!next) return true;
      try {
        await send(next.method, next.path, next.body);
      } catch (e) {
        if (unreachable(e)) return false; // still offline; try again later
        // Rejected (e.g. the item was deleted meanwhile): drop it and carry on.
      }
      save(rest);
    }
  } finally {
    flushing = false;
  }
}

export const api = {
  get: <T>(p: string) => call<T>('GET', p),
  post: <T>(p: string, b: unknown = {}) => call<T>('POST', p, b),
  patch: <T>(p: string, b: unknown) => call<T>('PATCH', p, b),
  put: <T>(p: string, b: unknown) => call<T>('PUT', p, b),
  del: <T>(p: string) => call<T>('DELETE', p),
};
