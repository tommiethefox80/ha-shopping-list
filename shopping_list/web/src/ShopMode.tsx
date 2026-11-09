import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';
import type { Category, Item } from './types';
import { money, photoUrl } from './util';

/** Full-screen in-store view: big rows in aisle order, tap to tick, undo, progress and trolley total. */
export function ShopMode({ state, act, list, onClose }: PageProps & { onClose: () => void }) {
  const [undo, setUndo] = useState<{ id: string; name: string; status: 'todo' | 'ticked' }>();
  const [finished, setFinished] = useState(false);
  const [showTrolley, setShowTrolley] = useState(false);
  // Items ticked during this trip, so the summary can say what you got.
  const [startedAt] = useState(() => new Date().toISOString());

  // Keep the screen awake while shopping.
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: { release: () => Promise<void> } | undefined;
    const get = () =>
      (navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock
        .request('screen')
        .then((l) => (lock = l))
        .catch(() => undefined);
    void get();
    const again = () => document.visibilityState === 'visible' && void get();
    document.addEventListener('visibilitychange', again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      void lock?.release();
    };
  }, []);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(undefined), 5000);
    return () => clearTimeout(t);
  }, [undo]);

  const items = state.items.filter((i) => i.listId === list.id);
  const open = items.filter((i) => i.status === 'todo');
  const trolley = items.filter((i) => i.status === 'ticked').sort((a, b) => (b.tickedAt ?? '').localeCompare(a.tickedAt ?? ''));
  const gotThisTrip = trolley.filter((i) => (i.tickedAt ?? '') >= startedAt);
  const total = items.length;
  const done = trolley.length;
  const sum = (xs: Item[]) => xs.reduce((s, i) => s + (i.resolved.price ?? 0) * i.qty, 0);

  const groups = useMemo(() => {
    const cats = new Map(state.categories.map((c) => [c.id, c]));
    const order = [...list.aisleOrder, ...state.categories.map((c) => c.id).filter((c) => !list.aisleOrder.includes(c))];
    return order
      .map((id) => ({ cat: cats.get(id), items: open.filter((i) => i.resolved.categoryId === id) }))
      .filter((g): g is { cat: Category; items: Item[] } => !!g.cat && g.items.length > 0);
  }, [open, list.aisleOrder, state.categories]);

  const tick = (i: Item, status: 'todo' | 'ticked') => {
    navigator.vibrate?.(30);
    setUndo({ id: i.id, name: i.name, status: status === 'ticked' ? 'todo' : 'ticked' });
    void act(() => api.patch(`items/${i.id}`, { status }));
  };

  if (finished) {
    return (
      <div className="shop-mode">
        <div className="shop-top">
          <h2>Shop done 🎉</h2>
        </div>
        <div className="shop-body">
          <p className="big-stat">Got <strong>{gotThisTrip.length}</strong> item{gotThisTrip.length === 1 ? '' : 's'}{sum(gotThisTrip) ? ` · ${money(sum(gotThisTrip))}` : ''}</p>
          {open.length > 0 ? (
            <>
              <h3>Still to get ({open.length})</h3>
              <ul className="shop-missed">{open.map((i) => <li key={i.id}>{i.name}{i.qty > 1 ? ` ×${i.qty}` : ''}</li>)}</ul>
              <p className="muted small">These stay on the list for next time.</p>
            </>
          ) : (
            <p>Everything on the list is in the trolley.</p>
          )}
          <div className="row gap-top">
            <button className="grow" onClick={() => act(() => api.post(`lists/${list.id}/clear-done`), 'Cleared').then(onClose)}>Clear the ticked items</button>
            <button className="secondary" onClick={onClose}>Keep them</button>
          </div>
          <button className="ghost wide" onClick={() => setFinished(false)}>‹ Back to shopping</button>
        </div>
      </div>
    );
  }

  return (
    <div className="shop-mode">
      <div className="shop-top">
        <button className="ghost" onClick={onClose}>✕</button>
        <div className="grow">
          <div className="row between shop-title">
            <strong>{list.name}</strong>
            <span>{done}/{total}</span>
          </div>
          <div className="shop-progress"><span style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
        </div>
        <button onClick={() => setFinished(true)}>Finish</button>
      </div>

      <div className="shop-body">
        {open.length === 0 && <p className="big-stat center">All done ✓<br /><span className="muted small">Tap Finish when you're through the till.</span></p>}
        {groups.map((g) => (
          <section key={g.cat.id}>
            <h3 className="shop-aisle">{g.cat.emoji} {g.cat.name}</h3>
            <ul className="shop-items">
              {g.items.map((i) => {
                const pic = i.resolved.photo ? photoUrl(i.resolved.photo) : i.resolved.imageUrl;
                return (
                  <li key={i.id} onClick={() => tick(i, 'ticked')}>
                    <span className="shop-tick" />
                    {pic && <img src={pic} alt="" />}
                    <span className="grow">
                      <span className="shop-name">{i.qty > 1 && <span className="shop-qty">{i.qty} ×</span>} {i.name}</span>
                      {(i.resolved.detail || i.note) && (
                        <span className="shop-sub">{[i.resolved.detail !== i.name ? i.resolved.detail : undefined, i.note ? `“${i.note}”` : undefined].filter(Boolean).join(' · ')}</span>
                      )}
                    </span>
                    {i.resolved.price ? <span className="shop-price">{money(i.resolved.price * i.qty)}</span> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {trolley.length > 0 && (
          <section className="shop-trolley">
            <button className="link" onClick={() => setShowTrolley(!showTrolley)}>
              {showTrolley ? '▾' : '▸'} In the trolley ({trolley.length}){sum(trolley) ? ` · ${money(sum(trolley))}` : ''}
            </button>
            {showTrolley && (
              <ul className="shop-items done">
                {trolley.map((i) => (
                  <li key={i.id} onClick={() => tick(i, 'todo')}>
                    <span className="shop-tick on">✓</span>
                    <span className="grow shop-name">{i.qty > 1 ? `${i.qty} × ` : ''}{i.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {undo && (
        <div className="shop-undo">
          <span>{undo.status === 'todo' ? 'Got' : 'Put back'} {undo.name}</span>
          <button className="link" onClick={() => { void act(() => api.patch(`items/${undo.id}`, { status: undo.status })); setUndo(undefined); }}>Undo</button>
        </div>
      )}
    </div>
  );
}
