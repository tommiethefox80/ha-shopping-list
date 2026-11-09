import { lazy, Suspense, useState } from 'react';
import { api } from './api';
import { money, parseMoney, photoUrl, pickAndUploadPhoto } from './util';
import type { PageProps } from './App';
import type { Product } from './types';

const Scanner = lazy(() => import('./Scanner').then((m) => ({ default: m.Scanner })));

/** Products: "when we say beans we mean Branston 410g", plus usuals and barcodes. */
export function ProductsPage({ state, act, toast }: PageProps) {
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Product | 'new'>();
  const f = filter.toLowerCase();
  const products = state.products
    .filter((p) => !f || [p.label, ...p.aliases, p.detail ?? ''].some((n) => n.toLowerCase().includes(f)))
    .sort((a, b) => Number(b.usual) - Number(a.usual) || a.label.localeCompare(b.label));

  return (
    <>
      <header className="page-head">
        <h1>Products</h1>
        <button onClick={() => setEditing('new')}>+ New</button>
      </header>
      <p className="muted small">Things you buy, and exactly which one you mean. ★ = a usual, shown at the top of the list.</p>
      <input className="filter" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <ul className="products">
        {products.map((p) => (
          <li key={p.id} onClick={() => setEditing(p)}>
            {p.photo || p.imageUrl ? <img src={p.photo ? photoUrl(p.photo) : p.imageUrl} alt="" loading="lazy" /> : <div className="img-ph" />}
            <div className="grow">
              <div className="name">
                {p.label}
                {p.defaultQty > 1 && <span className="muted"> ×{p.defaultQty}</span>}
                {p.price ? <span className="price"> {money(p.price)}</span> : null}
              </div>
              {p.detail && <div className="muted small">{p.detail}</div>}
              {(p.aliases.length > 0 || p.eans.length > 0) && (
                <div className="muted small">
                  {p.aliases.length > 0 && <>also: {p.aliases.join(', ')}</>}
                  {p.eans.length > 0 && <> · {p.eans.length} barcode{p.eans.length > 1 ? 's' : ''}</>}
                </div>
              )}
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
      {editing && <ProductEditor product={editing === 'new' ? undefined : editing} state={state} act={act} toast={toast} onClose={() => setEditing(undefined)} />}
    </>
  );
}

function ProductEditor({ product, state, act, toast, onClose }: { product?: Product; state: PageProps['state']; act: PageProps['act']; toast: PageProps['toast']; onClose: () => void }) {
  const [label, setLabel] = useState(product?.label ?? '');
  const [aliases, setAliases] = useState(product?.aliases.join(', ') ?? '');
  const [detail, setDetail] = useState(product?.detail ?? '');
  const [qty, setQty] = useState(product?.defaultQty ?? 1);
  const [usual, setUsual] = useState(product?.usual ?? false);
  const [eans, setEans] = useState<string[]>(product?.eans ?? []);
  const [scanning, setScanning] = useState(false);
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [price, setPrice] = useState(product?.price ? (product.price / 100).toFixed(2) : '');
  const [photo, setPhoto] = useState(product?.photo);
  const pic = photo ? photoUrl(photo) : product?.imageUrl;

  const save = () => {
    const body = {
      label, aliases: aliases.split(',').map((s) => s.trim()).filter(Boolean), detail, defaultQty: qty, usual, eans,
      categoryId, price: parseMoney(price), photo: photo ?? null,
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
        <div className="row photo-row">
          {pic ? <img className="photo" src={pic} alt="" /> : <div className="photo empty-photo">No photo</div>}
          <div className="grow">
            <label>When we say<input value={label} placeholder="e.g. beans" onChange={(e) => setLabel(e.target.value)} /></label>
            <button
              className="secondary small-btn"
              onClick={async () => {
                try {
                  const id = await pickAndUploadPhoto();
                  if (id) setPhoto(id);
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              📷 {pic ? 'Change photo' : 'Add photo'}
            </button>
          </div>
        </div>
        <label>We mean (brand, size, variety)<input value={detail} placeholder="e.g. Branston Baked Beans 410g" onChange={(e) => setDetail(e.target.value)} /></label>
        <label>Also known as (comma separated)<input value={aliases} placeholder="baked beans, branston beans" onChange={(e) => setAliases(e.target.value)} /></label>
        <div className="row">
          <label className="grow">
            Aisle
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Work it out</option>
              {state.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </select>
          </label>
          <label className="price-field">Price<input inputMode="decimal" placeholder="£" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        </div>
        <div className="row">
          <label className="grow">Usual quantity<input type="number" min={1} max={99} value={qty} onChange={(e) => setQty(Number(e.target.value))} /></label>
          <label className="check"><input type="checkbox" checked={usual} onChange={(e) => setUsual(e.target.checked)} /> ★ Usual</label>
        </div>

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
          <button disabled={!label.trim()} onClick={save}>Save</button>
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
