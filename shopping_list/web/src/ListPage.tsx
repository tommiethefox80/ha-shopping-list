import { lazy, Suspense, useMemo, useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';
import { ItemSheet } from './ItemSheet';
import type { Item } from './types';

const Scanner = lazy(() => import('./Scanner').then((m) => ({ default: m.Scanner })));

const OPEN = ['todo', 'needs_product', 'error', 'unavailable'];

export function ListPage({ state, act, go }: PageProps) {
  const [text, setText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [showDone, setShowDone] = useState(false);

  const open = state.items.filter((i) => OPEN.includes(i.status));
  const done = state.items.filter((i) => !OPEN.includes(i.status));
  const usuals = state.products.filter((p) => p.usual);
  const onList = useMemo(() => new Set(open.map((i) => i.resolved.productId).filter(Boolean)), [open]);
  const names = useMemo(() => [...new Set(state.products.flatMap((p) => [p.label, ...p.aliases]))].sort(), [state.products]);
  const job = state.job;
  const editingItem = state.items.find((i) => i.id === editing);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    void act(() => api.post('items', { text: t }));
  };

  return (
    <>
      <header className="page-head">
        <h1>Shopping list</h1>
        <span className="muted">{open.length} to get</span>
      </header>

      <form className="add-bar" onSubmit={add}>
        <input list="known-names" placeholder="Add item… e.g. 2 beans" value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="done" />
        <datalist id="known-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
        <button type="submit" aria-label="Add">+</button>
        <button type="button" className="scan-btn" aria-label="Scan barcode" onClick={() => setScanning(true)}>
          <BarcodeIcon />
        </button>
      </form>

      {usuals.length > 0 && (
        <section className="usuals">
          <div className="usuals-head">
            <span>Usuals</span>
            <button className="link" onClick={() => act(() => api.post('usuals/add'), 'Added all usuals')}>+ Add all</button>
          </div>
          <div className="chips">
            {usuals.map((p) => (
              <button key={p.id} className={`chip ${onList.has(p.id) ? 'on' : ''}`} onClick={() => act(() => api.post('usuals/add', { productIds: [p.id] }), `Added ${p.label}`)}>
                {onList.has(p.id) ? '✓ ' : '+ '}
                {p.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {open.length === 0 && <p className="empty">Nothing on the list. Add something above, scan a barcode, or tap a usual.</p>}
      <ul className="items">
        {open.map((i) => <ItemRow key={i.id} item={i} act={act} onOpen={() => setEditing(i.id)} />)}
      </ul>

      {done.length > 0 && (
        <section className="done">
          <div className="usuals-head">
            <button className="link" onClick={() => setShowDone(!showDone)}>{showDone ? '▾' : '▸'} Done ({done.length})</button>
            <button className="link" onClick={() => act(() => api.post('items/clear-done'), 'Cleared')}>Clear</button>
          </div>
          {showDone && <ul className="items faded">{done.map((i) => <ItemRow key={i.id} item={i} act={act} onOpen={() => setEditing(i.id)} />)}</ul>}
        </section>
      )}

      <section className="send">
        {job.running ? (
          <div className="progress-card">
            <div className="row between">
              <strong>Sending to Tesco… {job.processed}/{job.total}</strong>
              <button className="ghost" onClick={() => act(() => api.post('send/cancel'))}>Stop</button>
            </div>
            <progress max={job.total || 1} value={job.processed} />
            <p className="muted small">{job.current ? `Adding ${job.current}` : job.log.at(-1)?.text}</p>
          </div>
        ) : (
          <>
            {job.outcome && job.log.length > 0 && (
              <p className={`notice ${job.outcome === 'completed' ? 'ok' : 'warn'}`}>
                {job.log.at(-1)?.text}
                {job.outcome === 'signed_out' && <> · <button className="link" onClick={() => go('tesco')}>Sign in</button></>}
              </p>
            )}
            <button
              className="secondary wide"
              disabled={open.length === 0}
              onClick={() => act(() => api.post('send'))}
            >
              🛒 Send {open.length || ''} to Tesco basket
            </button>
            <p className="muted small center">Ticks items off as they're added. Book your slot on Tesco afterwards.</p>
          </>
        )}
      </section>

      {scanning && (
        <Suspense fallback={null}><Scanner
          title="Scan to add"
          continuous
          onClose={() => setScanning(false)}
          onCode={async (ean) => {
            try {
              const r = await api.post<{ matched: boolean; lookedUp?: string; item: Item }>('scan', { ean });
              void act(async () => {});
              return r.matched ? `✓ ${r.item.name} (×${r.item.qty})` : r.lookedUp ? `Added ${r.item.name} — pick its Tesco product later` : `Added barcode ${ean} — not recognised, name it on the list`;
            } catch (e) {
              return (e as Error).message;
            }
          }}
        /></Suspense>
      )}
      {editingItem && <ItemSheet item={editingItem} state={state} act={act} onClose={() => setEditing(undefined)} />}
    </>
  );
}

function ItemRow({ item, act, onOpen }: { item: Item; act: PageProps['act']; onOpen: () => void }) {
  const ticked = item.status === 'ticked' || item.status === 'in_basket';
  const setQty = (qty: number) => (qty < 1 ? act(() => api.del(`items/${item.id}`)) : act(() => api.patch(`items/${item.id}`, { qty })));
  return (
    <li className={`item ${item.status}`}>
      <button
        className={`tick ${ticked ? 'on' : ''}`}
        aria-label={ticked ? 'Untick' : 'Tick off'}
        onClick={() => act(() => api.patch(`items/${item.id}`, { status: ticked ? 'todo' : 'ticked' }))}
      >
        {ticked ? '✓' : ''}
      </button>
      <div className="grow" onClick={onOpen}>
        <div className="name">{item.name}</div>
        <div className="sub">
          {item.status === 'in_basket' && <span className="pill ok">In Tesco basket</span>}
          {item.status === 'needs_product' && <span className="pill warn">Pick product</span>}
          {item.status === 'unavailable' && <span className="pill warn">Unavailable</span>}
          {item.status === 'error' && <span className="pill bad">Problem</span>}
          <span className="muted">{item.status === 'todo' || item.status === 'ticked' ? item.resolved.tescoName ?? 'No default product' : item.message ?? item.resolved.tescoName}</span>
        </div>
      </div>
      {!ticked && (
        <div className="qty">
          <button onClick={() => setQty(item.qty - 1)} aria-label="Less">−</button>
          <span>{item.qty}</span>
          <button onClick={() => setQty(item.qty + 1)} aria-label="More">+</button>
        </div>
      )}
    </li>
  );
}

export function BarcodeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 8v8M10 8v8M13 8v8M16 8v8" />
    </svg>
  );
}
