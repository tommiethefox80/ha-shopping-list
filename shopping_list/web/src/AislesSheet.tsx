import { useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';

/** Put the aisles in the order you walk this shop; add, rename or remove aisles. */
export function AislesSheet({ state, act, list, onClose }: PageProps & { onClose: () => void }) {
  const known = new Map(state.categories.map((c) => [c.id, c]));
  const [order, setOrder] = useState<string[]>(() => [
    ...list.aisleOrder.filter((id) => known.has(id)),
    ...state.categories.map((c) => c.id).filter((id) => !list.aisleOrder.includes(id)),
  ]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const counts = new Map<string, number>();
  for (const i of state.items) if (i.listId === list.id && i.status === 'todo') counts.set(i.resolved.categoryId, (counts.get(i.resolved.categoryId) ?? 0) + 1);

  const move = (idx: number, by: number) => {
    const to = idx + by;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    [next[idx], next[to]] = [next[to], next[idx]];
    setOrder(next);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Aisles for {list.name}</h2>
          <button onClick={() => act(() => api.patch(`lists/${list.id}`, { aisleOrder: order }), 'Aisle order saved').then(onClose)}>Save</button>
        </div>
        <p className="muted small">Put them in the order you walk round the shop. The list follows this order.</p>
        <ul className="aisle-order">
          {order.map((id, idx) => {
            const c = known.get(id)!;
            return (
              <li key={id}>
                <span className="grow">
                  {c.emoji} {c.name} {counts.get(id) ? <span className="muted small">({counts.get(id)})</span> : null}
                </span>
                <button className="mini" aria-label="Move up" onClick={() => move(idx, -1)} disabled={idx === 0}>↑</button>
                <button className="mini" aria-label="Move down" onClick={() => move(idx, 1)} disabled={idx === order.length - 1}>↓</button>
                {id !== 'other' && (
                  <button
                    className="mini danger"
                    aria-label="Remove aisle"
                    onClick={() => confirm(`Remove the "${c.name}" aisle? Items in it move to Other.`) && act(() => api.del(`categories/${id}`)).then(() => setOrder(order.filter((x) => x !== id)))}
                  >
                    ✕
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <form
          className="row gap-top"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            void act(async () => {
              const c = await api.post<{ id: string }>('categories', { name, emoji: emoji || '🛒' });
              setOrder((o) => [...o, c.id]);
              setName('');
              setEmoji('');
            }, 'Aisle added');
          }}
        >
          <input className="emoji-in" placeholder="🛒" value={emoji} onChange={(e) => setEmoji(e.target.value)} />
          <input placeholder="New aisle, e.g. Garden" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit">Add</button>
        </form>
      </div>
    </div>
  );
}
