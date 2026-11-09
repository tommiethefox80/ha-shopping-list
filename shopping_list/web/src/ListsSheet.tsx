import { useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';
import type { ShopList } from './types';

/** Switch between lists (Tesco, Aldi, B&Q…), add, rename or delete them. */
export function ListsSheet({ state, act, list, setListId, onClose, onArrange }: PageProps & { onClose: () => void; onArrange: () => void }) {
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<ShopList>();
  const [newName, setNewName] = useState('');
  const count = (id: string) => state.items.filter((i) => i.listId === id && i.status === 'todo').length;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Lists</h2>
          <button className="ghost" onClick={onClose}>Done</button>
        </div>
        <ul className="lists">
          {state.lists.map((l) => (
            <li key={l.id} className={l.id === list.id ? 'on' : ''}>
              {renaming?.id === l.id ? (
                <form className="row grow" onSubmit={(e) => { e.preventDefault(); void act(() => api.patch(`lists/${l.id}`, { name: newName })).then(() => setRenaming(undefined)); }}>
                  <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <button type="submit">Save</button>
                </form>
              ) : (
                <>
                  <button className="grow list-pick" onClick={() => { setListId(l.id); onClose(); }}>
                    {l.id === list.id ? '● ' : ''}{l.name} <span className="muted small">{count(l.id)} to get</span>
                  </button>
                  <button className="link" onClick={() => { setRenaming(l); setNewName(l.name); }}>Rename</button>
                  {state.lists.length > 1 && (
                    <button
                      className="link danger"
                      onClick={() => confirm(`Delete "${l.name}" and its items?`) && act(() => api.del(`lists/${l.id}`), 'Deleted').then(() => l.id === list.id && setListId(state.lists.find((x) => x.id !== l.id)!.id))}
                    >
                      Delete
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim();
            if (!n) return;
            setName('');
            void act(async () => {
              const created = await api.post<ShopList>('lists', { name: n });
              setListId(created.id);
            }, `Created ${n}`).then(onClose);
          }}
        >
          <input placeholder="New list, e.g. Aldi or B&Q" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit">Add</button>
        </form>
        <button className="secondary wide gap-top" onClick={onArrange}>⇅ Arrange aisles for {list.name}</button>
      </div>
    </div>
  );
}
