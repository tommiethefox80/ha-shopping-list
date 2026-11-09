import { useCallback, useEffect, useRef, useState } from 'react';
import { api, flushOutbox, outbox, QueuedOffline, type QueuedCall } from './api';
import { applyOutbox, cachedState, cacheState } from './offline';
import { ListPage } from './ListPage';
import { ProductsPage } from './ProductsPage';
import { MealsPage } from './MealsPage';
import { RecipesPage } from './RecipesPage';
import type { AppState } from './types';

type Tab = 'list' | 'meals' | 'recipes' | 'defaults';
const tabFromHash = (): Tab => {
  const h = location.hash.slice(1);
  return h === 'defaults' || h === 'recipes' || h === 'meals' ? h : 'list';
};
const savedList = () => {
  try {
    return localStorage.getItem('listId') ?? undefined;
  } catch {
    return undefined;
  }
};

export function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [serverState, setServerState] = useState<AppState | undefined>(cachedState);
  const [queue, setQueue] = useState<QueuedCall[]>(outbox.get);
  const [offline, setOffline] = useState(false);
  const state = serverState && applyOutbox(serverState, queue);
  const [listId, setListIdState] = useState<string | undefined>(savedList);
  const [error, setError] = useState<string>();
  const [toast, setToast] = useState<string>();
  const listRef = useRef(listId);
  listRef.current = listId;

  const refresh = useCallback(async () => {
    try {
      const q = listRef.current ? `?listId=${encodeURIComponent(listRef.current)}` : '';
      if (!(await flushOutbox())) throw new TypeError('offline');
      const s = await api.get<AppState>(`state${q}`);
      setServerState(s);
      cacheState(s);
      setOffline(false);
      setError(undefined);
    } catch (e) {
      // No signal: keep showing what we have; queued changes go when it's back.
      if (e instanceof TypeError) setOffline(true);
      else setError((e as Error).message);
    }
  }, []);

  // Live updates: the add-on pushes "changed" the moment anyone edits the list.
  // Falls back to polling every 30s if the stream can't be kept open.
  useEffect(() => {
    void refresh();
    let es: EventSource | undefined;
    try {
      es = new EventSource('api/events');
      es.addEventListener('changed', () => void refresh());
      es.addEventListener('hello', () => void refresh());
    } catch {
      /* no SSE */
    }
    const t = setInterval(refresh, 30_000);
    const retry = setInterval(() => outbox.get().length && refresh(), 8000);
    const off = outbox.subscribe(setQueue);
    window.addEventListener('online', refresh);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      es?.close();
      clearInterval(t);
      clearInterval(retry);
      off();
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    const f = () => setTab(tabFromHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const go = (t: Tab) => {
    location.hash = t;
    setTab(t);
  };

  const setListId = (id: string) => {
    setListIdState(id);
    listRef.current = id;
    try {
      localStorage.setItem('listId', id);
    } catch {
      /* ignore */
    }
    void refresh();
  };

  /** Run an action, show errors as a toast, then reload state. */
  const act = useCallback(
    async (fn: () => Promise<unknown>, done?: string) => {
      try {
        await fn();
        if (done) setToast(done);
      } catch (e) {
        if (e instanceof QueuedOffline) setOffline(true);
        else setToast((e as Error).message);
      }
      await refresh();
    },
    [refresh],
  );

  const current = state && (state.lists.find((l) => l.id === listId) ?? state.lists[0]);
  const ctx = { state: state!, act, toast: setToast, refresh, go, list: current!, setListId };

  return (
    <div className="app">
      <main>
        {(offline || queue.length > 0) && (
          <p className="notice offline">
            📴 {offline ? 'No signal.' : 'Syncing…'} {queue.length > 0 ? `${queue.length} change${queue.length > 1 ? 's' : ''} saved on this phone, will sync when you're back online.` : 'Showing the list as it was last loaded.'}
          </p>
        )}
        {error && <p className="notice warn">Can't reach the add-on: {error}</p>}
        {!state ? <p className="muted center">Loading…</p> : tab === 'list' ? <ListPage {...ctx} /> : tab === 'meals' ? <MealsPage {...ctx} /> : tab === 'recipes' ? <RecipesPage {...ctx} /> : <ProductsPage {...ctx} />}
      </main>
      {toast && <div className="toast">{toast}</div>}
      <nav className="tabs">
        <button className={tab === 'list' ? 'on' : ''} onClick={() => go('list')}>
          <span className="ico">☰</span>List
        </button>
        <button className={tab === 'meals' ? 'on' : ''} onClick={() => go('meals')}>
          <span className="ico">📅</span>Meals
        </button>
        <button className={tab === 'recipes' ? 'on' : ''} onClick={() => go('recipes')}>
          <span className="ico">🍳</span>Recipes
        </button>
        <button className={tab === 'defaults' ? 'on' : ''} onClick={() => go('defaults')}>
          <span className="ico">★</span>Products
        </button>
      </nav>
    </div>
  );
}

export interface PageProps {
  state: AppState;
  act: (fn: () => Promise<unknown>, done?: string) => Promise<void>;
  toast: (msg: string) => void;
  refresh: () => Promise<void>;
  go: (t: 'list' | 'meals' | 'recipes' | 'defaults') => void;
  list: import('./types').ShopList;
  setListId: (id: string) => void;
}
