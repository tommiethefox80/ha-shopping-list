import { lazy, Suspense, useMemo, useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';
import { AddBar } from './AddBar';
import { AislesSheet } from './AislesSheet';
import { CardsSheet } from './CardsSheet';
import { ItemSheet } from './ItemSheet';
import { ListsSheet } from './ListsSheet';
import { ShopMode } from './ShopMode';
import type { Category, Item } from './types';
import { ago, money, photoUrl } from './util';

const Scanner = lazy(() => import('./Scanner').then((m) => ({ default: m.Scanner })));

export function ListPage(props: PageProps) {
  const { state, act, list } = props;
  const [scanning, setScanning] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [showDone, setShowDone] = useState(false);
  const [sheet, setSheet] = useState<'lists' | 'aisles' | 'cards' | 'shop'>();
  const [showActivity, setShowActivity] = useState(false);

  const items = state.items.filter((i) => i.listId === list.id);
  const open = items.filter((i) => i.status === 'todo');
  const done = items.filter((i) => i.status === 'ticked').sort((a, b) => (b.tickedAt ?? '').localeCompare(a.tickedAt ?? ''));
  const usuals = state.products.filter((p) => p.usual);
  const onList = useMemo(() => new Set(open.map((i) => i.resolved.productId).filter(Boolean)), [open]);
  const editingItem = state.items.find((i) => i.id === editing);

  // Group open items by aisle, in this list's walking order.
  const groups = useMemo(() => {
    const cats = new Map(state.categories.map((c) => [c.id, c]));
    const order = [...list.aisleOrder, ...state.categories.map((c) => c.id).filter((c) => !list.aisleOrder.includes(c))];
    return order
      .map((id) => ({ cat: cats.get(id), items: open.filter((i) => i.resolved.categoryId === id) }))
      .filter((g): g is { cat: Category; items: Item[] } => !!g.cat && g.items.length > 0);
  }, [open, list.aisleOrder, state.categories]);

  const total = (xs: Item[]) => xs.reduce((s, i) => s + (i.resolved.price ?? 0) * i.qty, 0);
  const priced = items.some((i) => i.resolved.price);
  const unpriced = open.filter((i) => !i.resolved.price).length;

  return (
    <>
      <header className="page-head">
        <button className="list-switch" onClick={() => setSheet('lists')}>
          <h1>{list.name}</h1>
          <span className="caret">▾</span>
        </button>
        <span className="row head-right">
          <span className="muted to-get">{open.length} to get</span>
          <button className="card-btn" aria-label="Loyalty cards" onClick={() => setSheet('cards')}>💳</button>
          <button className="shop-btn" onClick={() => setSheet('shop')}>🛒 Shop</button>
        </span>
      </header>

      <AddBar {...props} onScan={() => setScanning(true)} />

      {usuals.length > 0 && (
        <section className="usuals">
          <div className="usuals-head">
            <span>Usuals</span>
            <button className="link" onClick={() => act(() => api.post('usuals/add', { listId: list.id }), 'Added all usuals')}>+ Add all</button>
          </div>
          <div className="chips">
            {usuals.map((p) => (
              <button
                key={p.id}
                className={`chip ${onList.has(p.id) ? 'on' : ''}`}
                onClick={() => act(() => api.post('usuals/add', { listId: list.id, productIds: [p.id] }), `Added ${p.label}`)}
              >
                {onList.has(p.id) ? '✓ ' : '+ '}
                {p.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {state.suggestions.length > 0 && (
        <section className="usuals suggest">
          <div className="usuals-head">
            <span>Running low?</span>
            <span className="muted small">from what you usually buy</span>
          </div>
          <div className="chips">
            {state.suggestions.map((s) => (
              <button
                key={s.key}
                className="chip"
                title={`Usually every ${s.everyDays} days, last ${s.daysSince} days ago`}
                onClick={() => act(() => api.post('items', { name: s.name, productId: s.productId, qty: s.qty, listId: list.id, source: 'suggestion' }), `Added ${s.name}`)}
              >
                + {s.name} <span className="chip-meta">{s.daysSince}d</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {open.length === 0 && <p className="empty">Nothing on the list. Add something above, scan a barcode, or tap a usual.</p>}
      {groups.map((g) => (
        <section key={g.cat.id} className="aisle">
          <h2 className="aisle-head">
            <span>{g.cat.emoji}</span> {g.cat.name}
          </h2>
          <ul className="items">
            {g.items.map((i) => <ItemRow key={i.id} item={i} act={act} onOpen={() => setEditing(i.id)} />)}
          </ul>
        </section>
      ))}
      {open.length > 0 && (
        <div className="row between list-tools">
          <button className="link" onClick={() => setSheet('aisles')}>⇅ Arrange aisles for {list.name}</button>
        </div>
      )}

      {priced && (
        <div className="totals">
          <span>
            List <strong>{money(total(open))}</strong>
            {unpriced > 0 && <span className="muted small"> + {unpriced} unpriced</span>}
          </span>
          {done.length > 0 && <span>In trolley <strong>{money(total(done))}</strong></span>}
        </div>
      )}

      {done.length > 0 && (
        <section className="done">
          <div className="usuals-head">
            <button className="link" onClick={() => setShowDone(!showDone)}>{showDone ? '▾' : '▸'} Got it ({done.length})</button>
            <button className="link" onClick={() => act(() => api.post(`lists/${list.id}/clear-done`), 'Cleared')}>Clear</button>
          </div>
          {showDone && <ul className="items faded">{done.map((i) => <ItemRow key={i.id} item={i} act={act} onOpen={() => setEditing(i.id)} />)}</ul>}
        </section>
      )}

      {state.activity.length > 0 && (
        <section className="activity">
          <button className="link" onClick={() => setShowActivity(!showActivity)}>{showActivity ? '▾' : '▸'} Recent changes</button>
          {showActivity && (
            <ul className="log">
              {state.activity
                .filter((a) => !a.listId || a.listId === list.id)
                .slice(0, 20)
                .map((a, i) => (
                  <li key={i}>
                    <strong>{a.who ?? 'Someone'}</strong> {a.text} <span className="muted small">· {ago(a.at)}</span>
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}

      {state.ha && (state.ha.connected || state.ha.error) && (
        <p className={`muted small ha-status ${state.ha.error ? 'warn-text' : ''}`}>
          {state.ha.error ? `⚠ ${state.ha.error}` : `🏠 Synced with Home Assistant (${state.ha.entities.join(', ')})`}
        </p>
      )}

      {scanning && (
        <Suspense fallback={null}>
          <Scanner
            title={`Scan to add to ${list.name}`}
            continuous
            onClose={() => setScanning(false)}
            onCode={async (ean) => {
              try {
                const r = await api.post<{ matched: boolean; lookedUp?: string; item: Item }>('scan', { ean, listId: list.id });
                void act(async () => {});
                return r.matched
                  ? `✓ ${r.item.name} (×${r.item.qty})`
                  : r.lookedUp
                    ? `✓ ${r.lookedUp} — saved, next scan is instant`
                    : `Added barcode ${ean} — not recognised, tap it on the list to name it`;
              } catch (e) {
                return (e as Error).message;
              }
            }}
          />
        </Suspense>
      )}
      {editingItem && <ItemSheet {...props} item={editingItem} onClose={() => setEditing(undefined)} />}
      {sheet === 'lists' && <ListsSheet {...props} onClose={() => setSheet(undefined)} onArrange={() => setSheet('aisles')} />}
      {sheet === 'aisles' && <AislesSheet {...props} onClose={() => setSheet(undefined)} />}
      {sheet === 'cards' && <CardsSheet {...props} onClose={() => setSheet(undefined)} />}
      {sheet === 'shop' && <ShopMode {...props} onClose={() => setSheet(undefined)} />}
    </>
  );
}

function ItemRow({ item, act, onOpen }: { item: Item; act: PageProps['act']; onOpen: () => void }) {
  const ticked = item.status === 'ticked';
  const setQty = (qty: number) => (qty < 1 ? act(() => api.del(`items/${item.id}`)) : act(() => api.patch(`items/${item.id}`, { qty })));
  const pic = item.resolved.photo ? photoUrl(item.resolved.photo) : item.resolved.imageUrl;
  const sub = [
    item.resolved.detail && item.resolved.detail.toLowerCase() !== item.name.toLowerCase() ? item.resolved.detail : undefined,
    item.note ? `“${item.note}”` : undefined,
  ].filter(Boolean);
  return (
    <li className={`item ${item.status}`}>
      <button
        className={`tick ${ticked ? 'on' : ''}`}
        aria-label={ticked ? 'Untick' : 'Tick off'}
        onClick={() => act(() => api.patch(`items/${item.id}`, { status: ticked ? 'todo' : 'ticked' }))}
      >
        {ticked ? '✓' : ''}
      </button>
      {pic && <img className="thumb" src={pic} alt="" loading="lazy" onClick={onOpen} />}
      <div className="grow" onClick={onOpen}>
        <div className="name">
          {item.name}
          {ticked && item.qty > 1 && <span className="muted"> ×{item.qty}</span>}
        </div>
        {sub.length > 0 && <div className="sub muted">{sub.join(' · ')}</div>}
        {item.resolved.price ? <div className="sub price">{money(item.resolved.price * item.qty)}{item.qty > 1 && <span className="muted"> ({money(item.resolved.price)} each)</span>}</div> : null}
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
