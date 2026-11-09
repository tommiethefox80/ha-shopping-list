import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { ListPage } from './ListPage';
import { ProductsPage } from './ProductsPage';
import { RecipesPage } from './RecipesPage';
import type { AppState } from './types';

type Tab = 'list' | 'recipes' | 'defaults';
const tabFromHash = (): Tab => {
  const h = location.hash.slice(1);
  return h === 'defaults' || h === 'recipes' ? h : 'list';
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
  const [state, setState] = useState<AppState>();
  const [listId, setListIdState] = useState<string | undefined>(savedList);
  const [error, setError] = useState<string>();
  const [toast, setToast] = useState<string>();
  const listRef = useRef(listId);
  listRef.current = listId;

  const refresh = useCallback(async () => {
    try {
      const q = listRef.current ? `?listId=${encodeURIComponent(listRef.current)}` : '';
      setState(await api.get<AppState>(`state${q}`));
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
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
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      es?.close();
      clearInterval(t);
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
        setToast((e as Error).message);
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
        {error && <p className="notice warn">Can't reach the add-on: {error}</p>}
        {!state ? <p className="muted center">Loading…</p> : tab === 'list' ? <ListPage {...ctx} /> : tab === 'recipes' ? <RecipesPage {...ctx} /> : <ProductsPage {...ctx} />}
      </main>
      {toast && <div className="toast">{toast}</div>}
      <nav className="tabs">
        <button className={tab === 'list' ? 'on' : ''} onClick={() => go('list')}>
          <span className="ico">☰</span>List
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
  go: (t: 'list' | 'recipes' | 'defaults') => void;
  list: import('./types').ShopList;
  setListId: (id: string) => void;
}
