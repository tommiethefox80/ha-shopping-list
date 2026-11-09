import { useMemo, useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';
import type { Recipe } from './types';
import { isHeading, norm, scaleLine } from './util';

type Pick = { key: string; group: string; line: string; recipe: string; name: string; checked: boolean; onList: boolean };

/** Tick which ingredients to add. Staples (salt, oil…) and things already on the list start unticked. */
export function IngredientPicker({ state, act, list, title, groups, onClose }: PageProps & {
  title: string;
  /** e.g. [{ label: 'Mon · Chilli', recipe, servings: 6 }] */
  groups: { label: string; recipe: Recipe; servings: number }[];
  onClose: () => void;
}) {
  const onListNames = useMemo(
    () => new Set(state.items.filter((i) => i.listId === list.id && i.status === 'todo').flatMap((i) => [norm(i.name), ...(i.resolved.detail ? [norm(i.resolved.detail)] : [])])),
    [state.items, list.id],
  );
  const [picks, setPicks] = useState<Pick[]>(() =>
    groups.flatMap(({ label, recipe, servings }, g) =>
      recipe.ingredients.flatMap((l, idx) => {
        if (isHeading(l)) return [];
        const p = recipe.parsed[idx];
        const name = p?.name ?? l;
        const onList = onListNames.has(norm(name));
        return [{ key: `${g}:${idx}`, group: label, line: scaleLine(l, servings / recipe.servings), recipe: recipe.name, name, checked: !onList && !p?.staple, onList }];
      }),
    ),
  );
  const chosen = picks.filter((p) => p.checked);
  const toggle = (key: string) => setPicks(picks.map((p) => (p.key === key ? { ...p, checked: !p.checked } : p)));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose}>Cancel</button>
        </div>
        <p className="muted small">Untick anything you already have. Salt, oil and things already on the list start unticked.</p>
        {groups.map(({ label }, g) => (
          <section key={g}>
            {groups.length > 1 && <h3>{label}</h3>}
            <ul className="pick">
              {picks.filter((p) => p.key.startsWith(`${g}:`)).map((p) => (
                <li key={p.key}>
                  <label className="check">
                    <input type="checkbox" checked={p.checked} onChange={() => toggle(p.key)} />
                    <span className="grow">
                      <strong>{p.name}</strong>
                      {p.line.toLowerCase() !== p.name.toLowerCase() && <span className="muted small"> — {p.line}</span>}
                      {p.onList && <span className="pill ok">on list</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <button
          className="wide gap-top"
          disabled={!chosen.length}
          onClick={() => act(() => api.post('recipes/add-to-list', { listId: list.id, lines: chosen.map((p) => ({ line: p.line, recipe: p.recipe })) }), `Added ${chosen.length} to ${list.name}`).then(onClose)}
        >
          🛒 Add {chosen.length} to {list.name}
        </button>
      </div>
    </div>
  );
}
