import { useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';
import type { AppState, Item } from './types';

export function ItemSheet({ item, state, act, onClose }: { item: Item; state: AppState; act: PageProps['act']; onClose: () => void }) {
  const [name, setName] = useState(item.name);
  const [productId, setProductId] = useState(item.resolved.productId ?? '');
  const [saveAs, setSaveAs] = useState(false);
  const [detail, setDetail] = useState('');
  const products = [...state.products].sort((a, b) => a.label.localeCompare(b.label));

  const save = async () => {
    await act(async () => {
      let pid: string | null = productId || null;
      if (!pid && saveAs) {
        const p = await api.post<{ id: string }>('products', { label: name, detail, eans: item.ean ? [item.ean] : [] });
        pid = p.id;
      }
      await api.patch(`items/${item.id}`, { name, productId: pid });
    }, 'Saved');
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Edit item</h2>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Product
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">— none —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {p.detail ? ` — ${p.detail}` : ''}
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
        <div className="row between gap-top">
          <button className="danger" onClick={() => act(() => api.del(`items/${item.id}`), 'Removed').then(onClose)}>Remove</button>
          <button onClick={() => void save()}>Save</button>
        </div>
      </div>
    </div>
  );
}
