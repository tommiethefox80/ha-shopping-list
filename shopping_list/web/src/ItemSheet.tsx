import { useState } from 'react';
import { api, tescoUrl } from './api';
import type { PageProps } from './App';
import { CandidateList, TescoSearch } from './TescoSearch';
import type { AppState, Candidate, Item } from './types';

export function ItemSheet({ item, state, act, onClose }: { item: Item; state: AppState; act: PageProps['act']; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [remember, setRemember] = useState(true);
  const [searching, setSearching] = useState(item.status === 'needs_product' && !item.candidates?.length);

  const choose = (c: Candidate) =>
    act(() => api.post(`items/${item.id}/choose`, { candidate: c, remember }), remember ? `Saved: "${item.name}" = ${c.name || c.tescoId}` : 'Product set for this item').then(onClose);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Edit item</h2>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); void act(() => api.patch(`items/${item.id}`, { name })).then(onClose); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit">Save</button>
        </form>

        {item.message && <p className={`notice ${item.status === 'in_basket' ? 'ok' : 'warn'}`}>{item.message}</p>}

        <h3>Tesco product</h3>
        {item.resolved.tescoId ? (
          <p>
            <a href={tescoUrl(item.resolved.tescoId)} target="_blank" rel="noreferrer">{item.resolved.tescoName ?? item.resolved.tescoId}</a>
            {item.resolved.productId && <span className="muted small"> · default for “{state.products.find((p) => p.id === item.resolved.productId)?.label}”</span>}
          </p>
        ) : (
          <p className="muted">No default yet — Send to Tesco will search and ask you to pick.</p>
        )}

        <label className="check">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember as the default for “{item.name}”
        </label>
        {item.candidates?.length ? <CandidateList candidates={item.candidates} onPick={choose} /> : null}
        {searching ? (
          <TescoSearch initial={item.name.startsWith('Barcode ') ? '' : item.name} onPick={choose} />
        ) : (
          <button className="secondary" onClick={() => setSearching(true)}>{item.resolved.tescoId ? 'Change product…' : 'Search Tesco…'}</button>
        )}

        <div className="row between gap-top">
          <button className="danger" onClick={() => act(() => api.del(`items/${item.id}`), 'Removed').then(onClose)}>Remove from list</button>
          {item.status !== 'todo' && (
            <button className="secondary" onClick={() => act(() => api.patch(`items/${item.id}`, { status: 'todo' })).then(onClose)}>Back on list</button>
          )}
        </div>
      </div>
    </div>
  );
}
