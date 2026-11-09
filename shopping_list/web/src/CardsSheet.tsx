import { lazy, Suspense, useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';
import type { LoyaltyCard } from './types';

const Scanner = lazy(() => import('./Scanner').then((m) => ({ default: m.Scanner })));
const Barcode = lazy(() => import('./Barcode').then((m) => ({ default: m.Barcode })));

const fromZxing = (f: string): LoyaltyCard['format'] => (f === 'EAN_13' ? 'EAN13' : f === 'QR_CODE' ? 'QR' : 'CODE128');

/** Loyalty cards (Clubcard…) to show at the till. */
export function CardsSheet({ state, act, onClose }: PageProps & { onClose: () => void }) {
  const [showing, setShowing] = useState<LoyaltyCard>();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('Clubcard');
  const [number, setNumber] = useState('');
  const [format, setFormat] = useState<LoyaltyCard['format'] | ''>('');
  const [scanning, setScanning] = useState(false);

  if (showing) {
    return (
      <div className="card-full" onClick={() => setShowing(undefined)}>
        <h2>{showing.name}</h2>
        <Suspense fallback={<p>…</p>}>
          <Barcode number={showing.number} format={showing.format} />
        </Suspense>
        <p className="muted small">Turn your screen brightness up. Tap to close.</p>
      </div>
    );
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Cards</h2>
          <button className="ghost" onClick={onClose}>Done</button>
        </div>
        {state.cards.length === 0 && !adding && <p className="muted">Add your Clubcard so it's on the same screen as the list at the till.</p>}
        <ul className="lists">
          {state.cards.map((c) => (
            <li key={c.id}>
              <button className="grow list-pick" onClick={() => setShowing(c)}>
                💳 {c.name} <span className="muted small">…{c.number.slice(-4)}</span>
              </button>
              <button className="link danger" onClick={() => confirm(`Remove ${c.name}?`) && act(() => api.del(`cards/${c.id}`))}>Remove</button>
            </li>
          ))}
        </ul>
        {adding ? (
          <>
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Card number<input inputMode="numeric" value={number} placeholder="Scan the card, or type the number" onChange={(e) => { setNumber(e.target.value); setFormat(''); }} /></label>
            <div className="row">
              <button className="secondary" onClick={() => setScanning(true)}>📷 Scan card</button>
              <button
                disabled={!number.trim()}
                onClick={() => act(() => api.post('cards', { name, number, format: format || undefined }), 'Card saved').then(() => { setAdding(false); setNumber(''); })}
              >
                Save card
              </button>
            </div>
            <p className="muted small">Scanning the card or keyfob copies its exact barcode type, so the till reads it the same way.</p>
          </>
        ) : (
          <button className="secondary wide gap-top" onClick={() => setAdding(true)}>+ Add a card</button>
        )}
        {scanning && (
          <Suspense fallback={null}>
            <Scanner
              title="Scan your card"
              formats="any"
              onClose={() => setScanning(false)}
              onCode={(code, f) => {
                setNumber(code);
                setFormat(fromZxing(f));
              }}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}
