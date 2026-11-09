import { useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';
import type { Item } from './types';
import { PhotoButtons } from './PhotoButtons';
import { money, parseMoney, photoUrl } from './util';

export function ItemSheet({ item, state, act, toast, onClose }: PageProps & { item: Item; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [productId, setProductId] = useState(item.resolved.productId ?? '');
  const [categoryId, setCategoryId] = useState(item.resolved.categoryId);
  const [note, setNote] = useState(item.note ?? '');
  const [price, setPrice] = useState(item.resolved.price ? (item.resolved.price / 100).toFixed(2) : '');
  const [listId, setListId] = useState(item.listId);
  const [saveAs, setSaveAs] = useState(false);
  const [detail, setDetail] = useState('');
  const products = [...state.products].sort((a, b) => a.label.localeCompare(b.label));
  const product = state.products.find((p) => p.id === productId);
  const pic = product?.photo ? photoUrl(product.photo) : product?.imageUrl;

  /** Makes sure there's a product to hang a photo/detail on; returns its id. */
  const ensureProduct = async (): Promise<string> => {
    if (productId) return productId;
    const p = await api.post<{ id: string }>('products', { label: name, detail, categoryId, eans: item.ean ? [item.ean] : [] });
    setProductId(p.id);
    return p.id;
  };

  const save = async () => {
    const pence = parseMoney(price);
    await act(async () => {
      const pid = productId || (saveAs ? await ensureProduct() : null);
      await api.patch(`items/${item.id}`, {
        name, productId: pid, note, listId,
        ...(categoryId !== item.resolved.categoryId ? { categoryId } : {}),
        ...(pence !== (item.resolved.price ?? null) ? { price: pence } : {}),
      });
    }, 'Saved');
    onClose();
  };

  const savePhoto = async (photo: string) => {
    const pid = await ensureProduct();
    await act(() => api.patch(`products/${pid}`, { photo }), 'Photo saved');
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Edit item</h2>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
        <div className="row photo-row">
          {pic ? <img className="photo" src={pic} alt="" /> : <div className="photo empty-photo">No photo</div>}
          <div className="grow">
            <label>Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <PhotoButtons has={!!pic} onPhoto={savePhoto} onError={toast} />
          </div>
        </div>
        <label>
          Note for this shop
          <input value={note} placeholder="e.g. ripe ones, or Heinz if no Branston" onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="row">
          <label className="grow">
            Aisle
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {state.categories.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
            </select>
          </label>
          <label className="price-field">
            Price each
            <input inputMode="decimal" placeholder="£" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
        </div>
        <p className="muted small">Aisle and price are remembered for next time{product ? ` (for ${product.label})` : ''}.</p>
        <label>
          Product
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">— none —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.detail ? ` — ${p.detail}` : ''}
                {p.price ? ` (${money(p.price)})` : ''}
              </option>
            ))}
          </select>
        </label>
        {!productId && (
          <>
            <label className="check">
              <input type="checkbox" checked={saveAs} onChange={(e) => setSaveAs(e.target.checked)} />
              Save “{name}” as a product{item.ean ? ' (with its barcode)' : ''}
            </label>
            {saveAs && (
              <label>
                Exactly which one (brand, size)
                <input value={detail} placeholder="e.g. Branston Baked Beans 410g" onChange={(e) => setDetail(e.target.value)} />
              </label>
            )}
          </>
        )}
        {state.lists.length > 1 && (
          <label>
            On list
            <select value={listId} onChange={(e) => setListId(e.target.value)}>
              {state.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
        {item.addedBy && <p className="muted small">Added by {item.addedBy}</p>}
        <div className="row between gap-top">
          <button className="danger" onClick={() => act(() => api.del(`items/${item.id}`), 'Removed').then(onClose)}>Remove</button>
          <button onClick={() => void save()}>Save</button>
        </div>
      </div>
    </div>
  );
}
