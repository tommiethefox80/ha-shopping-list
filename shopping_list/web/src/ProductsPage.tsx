import { lazy, Suspense, useState } from 'react';
import { api, tescoUrl } from './api';
import type { PageProps } from './App';
import { TescoSearch } from './TescoSearch';
import type { Product } from './types';

const Scanner = lazy(() => import('./Scanner').then((m) => ({ default: m.Scanner })));

/** "When we say X we mean this Tesco product" — the lookup table, plus usuals. */
export function ProductsPage({ state, act }: PageProps) {
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Product | 'new'>();
  const f = filter.toLowerCase();
  const products = state.products
    .filter((p) => !f || [p.label, ...p.aliases, p.tescoName].some((n) => n.toLowerCase().includes(f)))
    .sort((a, b) => Number(b.usual) - Number(a.usual) || a.label.localeCompare(b.label));

  return (
    <>
      <header className="page-head">
        <h1>Products</h1>
        <button onClick={() => setEditing('new')}>+ New</button>
      </header>
      <p className="muted small">What you mean when you write each item. ★ = a usual, shown at the top of the list.</p>
      <input className="filter" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <ul className="products">
        {products.map((p) => (
          <li key={p.id} onClick={() => setEditing(p)}>
            {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" /> : <div className="img-ph" />}
            <div className="grow">
              <div className="name">{p.label}{p.defaultQty > 1 && <span className="muted"> ×{p.defaultQty}</span>}</div>
              <div className="muted small">{p.tescoName}</div>
              {(p.aliases.length > 0 || p.eans.length > 0) && (
                <div className="muted small">
                  {p.aliases.length > 0 && <>also: {p.aliases.join(', ')}</>}
                  {p.eans.length > 0 && <> · {p.eans.length} barcode{p.eans.length > 1 ? 's' : ''}</>}
                </div>
              )}
              {p.offerSwaps?.length ? <div className="small rule">↔ {p.offerSwaps.map((x) => x.tescoName).join(' / ')} if on offer</div> : null}
            </div>
            <button
              className={`star ${p.usual ? 'on' : ''}`}
              aria-label={p.usual ? 'Remove from usuals' : 'Add to usuals'}
              onClick={(e) => {
                e.stopPropagation();
                void act(() => api.patch(`products/${p.id}`, { usual: !p.usual }));
              }}
            >
              {p.usual ? '★' : '☆'}
            </button>
          </li>
        ))}
      </ul>
      {editing && <ProductEditor product={editing === 'new' ? undefined : editing} act={act} onClose={() => setEditing(undefined)} />}
    </>
  );
}

function ProductEditor({ product, act, onClose }: { product?: Product; act: PageProps['act']; onClose: () => void }) {
  const [label, setLabel] = useState(product?.label ?? '');
  const [aliases, setAliases] = useState(product?.aliases.join(', ') ?? '');
  const [qty, setQty] = useState(product?.defaultQty ?? 1);
  const [usual, setUsual] = useState(product?.usual ?? false);
  const [eans, setEans] = useState<string[]>(product?.eans ?? []);
  const [tesco, setTesco] = useState<{ tescoId: string; tescoName?: string; price?: string; imageUrl?: string } | undefined>(
    product && { tescoId: product.tescoId, tescoName: product.tescoName },
  );
  const [changing, setChanging] = useState(!product);
  const [swaps, setSwaps] = useState(product?.offerSwaps ?? []);
  const [addingSwap, setAddingSwap] = useState(false);
  const [scanning, setScanning] = useState(false);

  const save = () => {
    if (!tesco) return;
    const body = {
      label, aliases: aliases.split(',').map((s) => s.trim()).filter(Boolean), defaultQty: qty, usual, eans,
      tescoId: tesco.tescoId, tescoName: tesco.tescoName || undefined, price: tesco.price, imageUrl: tesco.imageUrl,
      offerSwaps: swaps,
    };
    void act(() => (product ? api.patch(`products/${product.id}`, body) : api.post('products', body)), 'Saved').then(onClose);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{product ? 'Edit product' : 'New product'}</h2>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
        <label>When we say<input value={label} placeholder="e.g. beans" onChange={(e) => setLabel(e.target.value)} /></label>
        <label>Also known as (comma separated)<input value={aliases} placeholder="baked beans, branston beans" onChange={(e) => setAliases(e.target.value)} /></label>
        <div className="row">
          <label className="grow">Usual quantity<input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></label>
          <label className="check"><input type="checkbox" checked={usual} onChange={(e) => setUsual(e.target.checked)} /> ★ Usual</label>
        </div>

        <h3>We mean this Tesco product</h3>
        {tesco && (
          <p>
            <a href={tescoUrl(tesco.tescoId)} target="_blank" rel="noreferrer">{tesco.tescoName || `Product ${tesco.tescoId}`}</a>
            {!changing && <button className="link" onClick={() => setChanging(true)}> Change</button>}
          </p>
        )}
        {changing && (
          <TescoSearch
            initial={label}
            onPick={(c) => {
              setTesco({ tescoId: c.tescoId, tescoName: c.name, price: c.clubcardPrice ?? c.price, imageUrl: c.imageUrl });
              if (!label) setLabel(c.name);
              setChanging(false);
            }}
          />
        )}

        <h3>Rule: use instead when on offer</h3>
        <p className="muted small">
          When you send to Tesco, if one of these is on offer (Clubcard Price, half price, multibuy…) it's used instead of the
          product above. You see the choice and can change it before anything is added.
        </p>
        {swaps.length > 0 && (
          <ul className="swaps">
            {swaps.map((sw, i) => (
              <li key={sw.tescoId}>
                <span className="grow">{i === 0 ? 'Use' : 'or'} <strong>{sw.tescoName}</strong> if on offer</span>
                <button className="link" onClick={() => setSwaps(swaps.filter((x) => x.tescoId !== sw.tescoId))}>Remove</button>
              </li>
            ))}
            <li className="muted small">otherwise {tesco?.tescoName || 'the product above'}</li>
          </ul>
        )}
        {addingSwap ? (
          <TescoSearch
            initial={label}
            onPick={(c) => {
              if (c.name && c.tescoId !== tesco?.tescoId && !swaps.some((x) => x.tescoId === c.tescoId)) {
                setSwaps([...swaps, { tescoId: c.tescoId, tescoName: c.name }]);
              }
              setAddingSwap(false);
            }}
          />
        ) : (
          <button className="secondary" onClick={() => setAddingSwap(true)}>+ Add an "if on offer" product</button>
        )}

        <h3>Barcodes</h3>
        <p className="muted small">Scanning one of these adds this product to the list straight away.</p>
        <div className="chips">
          {eans.map((e) => (
            <button key={e} className="chip" onClick={() => setEans(eans.filter((x) => x !== e))}>{e} ✕</button>
          ))}
          <button className="chip" onClick={() => setScanning(true)}>+ Scan barcode</button>
        </div>

        <div className="row between gap-top">
          {product ? (
            <button className="danger" onClick={() => confirm(`Delete "${product.label}"?`) && act(() => api.del(`products/${product.id}`), 'Deleted').then(onClose)}>Delete</button>
          ) : <span />}
          <button disabled={!tesco || !label.trim()} onClick={save}>Save</button>
        </div>
        {scanning && (
          <Suspense fallback={null}><Scanner
            title="Scan the product's barcode"
            onClose={() => setScanning(false)}
            onCode={(ean) => {
              setEans((xs) => (xs.includes(ean) ? xs : [...xs, ean]));
            }}
          /></Suspense>
        )}
      </div>
    </div>
  );
}
