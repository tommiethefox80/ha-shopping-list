import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { ListPage } from './ListPage';
import { ProductsPage } from './ProductsPage';
import { TescoPage } from './TescoPage';
import type { AppState } from './types';

type Tab = 'list' | 'defaults' | 'tesco';
const tabFromHash = (): Tab => (['list', 'defaults', 'tesco'].includes(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : 'list');

export function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  const [state, setState] = useState<AppState>();
  const [error, setError] = useState<string>();
  const [toast, setToast] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      setState(await api.get<AppState>('state'));
      setError(undefined);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  // Poll fast while a send is running; otherwise every 10s so changes from other phones show up.
  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, state?.job.running ? 1500 : 10_000);
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, state?.job.running]);

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

  const ctx = { state: state!, act, toast: setToast, refresh, go };

  return (
    <div className="app">
      <main>
        {error && <p className="notice warn">Can't reach the add-on: {error}</p>}
        {!state ? <p className="muted center">Loading…</p> : tab === 'list' ? <ListPage {...ctx} /> : tab === 'defaults' ? <ProductsPage {...ctx} /> : <TescoPage {...ctx} />}
      </main>
      {toast && <div className="toast">{toast}</div>}
      <nav className="tabs">
        <button className={tab === 'list' ? 'on' : ''} onClick={() => go('list')}>
          <span className="ico">☰</span>List
        </button>
        <button className={tab === 'defaults' ? 'on' : ''} onClick={() => go('defaults')}>
          <span className="ico">★</span>Products
        </button>
        <button className={tab === 'tesco' ? 'on' : ''} onClick={() => go('tesco')}>
          <span className="ico">🛒</span>Tesco
          {state?.session.signedIn === false && <span className="dot" />}
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
  go: (t: 'list' | 'defaults' | 'tesco') => void;
}
