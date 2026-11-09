import { useMemo, useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';
import { rankRecipes, words } from './cookable';
import { isoDay, recipePic } from './util';

/** Pick what you've got in; recipes are ranked by how little you'd need to buy. */
export function WhatCanIMake({ state, act, list, onClose, onOpen }: PageProps & { onClose: () => void; onOpen: (id: string) => void }) {
  const [have, setHave] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [useRecent, setUseRecent] = useState(state.recentlyBought.length > 0);
  const [useList, setUseList] = useState(false);

  const onListNames = state.items.filter((i) => i.listId === list.id && i.status === 'todo').map((i) => i.resolved.detail ?? i.name);

  // Quick picks: ingredients that appear most across your recipes.
  const common = useMemo(() => {
    const n = new Map<string, number>();
    for (const r of state.recipes)
      for (const p of r.parsed) {
        if (p.heading || p.staple) continue;
        const key = words(p.name).at(-1);
        if (key) n.set(p.name, (n.get(p.name) ?? 0) + 1);
      }
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([name]) => name);
  }, [state.recipes]);

  const all = [...have, ...(useRecent ? state.recentlyBought : []), ...(useList ? onListNames : [])];
  const ranked = useMemo(() => rankRecipes(state.recipes, all), [state.recipes, all.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  const addHave = (v: string) => {
    const t = v.trim();
    if (t && !have.includes(t)) setHave([...have, t]);
    setText('');
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>What can I make?</h2>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); addHave(text); }}>
          <input placeholder="What have you got? e.g. chicken" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit">Add</button>
        </form>
        {have.length > 0 && (
          <div className="chips">
            {have.map((h) => <button key={h} className="chip on" onClick={() => setHave(have.filter((x) => x !== h))}>{h} ✕</button>)}
          </div>
        )}
        {common.filter((c) => !have.includes(c)).length > 0 && (
          <div className="chips">
            {common.filter((c) => !have.includes(c)).map((c) => <button key={c} className="chip" onClick={() => addHave(c)}>+ {c}</button>)}
          </div>
        )}
        <label className="check">
          <input type="checkbox" checked={useRecent} onChange={(e) => setUseRecent(e.target.checked)} />
          Count what we bought this week ({state.recentlyBought.length})
        </label>
        <label className="check">
          <input type="checkbox" checked={useList} onChange={(e) => setUseList(e.target.checked)} />
          Count what's already on the list ({onListNames.length})
        </label>

        {state.recipes.length === 0 && <p className="muted">Add some recipes first.</p>}
        <ul className="cookable">
          {ranked.map((c) => {
            const pic = recipePic(c.recipe);
            return (
              <li key={c.recipe.id}>
                <div className="row cook-head" onClick={() => onOpen(c.recipe.id)}>
                  {pic ? <img src={pic} alt="" /> : <div className="img-ph" />}
                  <div className="grow">
                    <div className="name">{c.recipe.name}</div>
                    <div className={`small ${c.missing.length ? 'muted' : 'ok-text'}`}>
                      {c.missing.length ? `Have ${c.have} of ${c.needed}` : `✓ You've got everything`}
                    </div>
                  </div>
                  <div className="cook-meter"><span style={{ width: `${(c.have / c.needed) * 100}%` }} /></div>
                </div>
                {c.missing.length > 0 && (
                  <p className="small missing">Need: {c.missing.map((m) => m.name).join(', ')}</p>
                )}
                <div className="row">
                  {c.missing.length > 0 && (
                    <button
                      className="secondary small-btn"
                      onClick={() => act(() => api.post('recipes/add-to-list', { listId: list.id, lines: c.missing.map((m) => ({ line: m.line, recipe: c.recipe.name })) }), `Added ${c.missing.length} to ${list.name}`)}
                    >
                      🛒 Add {c.missing.length} missing
                    </button>
                  )}
                  <button
                    className="secondary small-btn"
                    onClick={() => act(() => api.put(`meals/${isoDay(new Date())}`, { recipeId: c.recipe.id }), "It's on for tonight")}
                  >
                    🍽️ Have it tonight
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
