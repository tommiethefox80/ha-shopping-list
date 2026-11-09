import { useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';
import type { Recipe } from './types';
import { addDays, isHeading, isoDay, mins, mondayOf, recipePic, scaleLine } from './util';

/** A recipe laid out like a cookbook page, with a cooking mode that keeps the screen on. */
export function RecipeView(props: PageProps & { recipe: Recipe; onClose: () => void; onEdit: () => void; onAddToList: (servings: number) => void }) {
  const { state, act, recipe, onClose, onEdit, onAddToList } = props;
  const [servings, setServings] = useState(recipe.servings);
  const [cooking, setCooking] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());
  const factor = servings / recipe.servings;
  const pic = recipePic(recipe);
  const total = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);

  // Keep the screen awake while cooking.
  useEffect(() => {
    if (!cooking || !('wakeLock' in navigator)) return;
    let lock: { release: () => Promise<void> } | undefined;
    (navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock
      .request('screen')
      .then((l) => (lock = l))
      .catch(() => undefined);
    return () => void lock?.release();
  }, [cooking]);

  const days = useMemo(() => {
    const mon = mondayOf(new Date());
    return Array.from({ length: 14 }, (_, i) => addDays(mon, i)).filter((d) => d >= addDays(new Date(), -1));
  }, []);
  const plannedOn = Object.entries(state.meals).filter(([d, m]) => m.recipeId === recipe.id && d >= isoDay(new Date())).map(([d]) => d).sort();

  let step = 0;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet recipe-page ${cooking ? 'cooking' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <button className="ghost" onClick={onClose}>‹ Back</button>
          <span className="row head-right">
            <button className="ghost" onClick={onEdit}>Edit</button>
          </span>
        </div>
        {pic && !cooking && <img className="recipe-hero" src={pic} alt="" />}
        <h1 className="recipe-title">{recipe.name}</h1>
        {recipe.description && !cooking && <p className="recipe-desc">{recipe.description}</p>}

        <div className="recipe-meta">
          <span className="meta-pill serves">
            👥
            <button aria-label="Fewer" onClick={() => setServings(Math.max(1, servings - 1))}>−</button>
            <strong>{servings}</strong>
            <button aria-label="More" onClick={() => setServings(servings + 1)}>+</button>
          </span>
          {recipe.prepMinutes ? <span className="meta-pill">🔪 Prep {mins(recipe.prepMinutes)}</span> : null}
          {recipe.cookMinutes ? <span className="meta-pill">🔥 Cook {mins(recipe.cookMinutes)}</span> : null}
          {recipe.prepMinutes && recipe.cookMinutes ? <span className="meta-pill">⏱ {mins(total)}</span> : null}
        </div>
        {recipe.tags.length > 0 && !cooking && (
          <div className="chips">{recipe.tags.map((t) => <span key={t} className="tag">#{t}</span>)}</div>
        )}

        <div className="row gap-top">
          <button className="grow" onClick={() => onAddToList(servings)}>🛒 Add ingredients to list</button>
          <button className={cooking ? '' : 'secondary'} onClick={() => setCooking(!cooking)}>{cooking ? '✓ Done cooking' : '👩‍🍳 Cook'}</button>
        </div>

        <section className="recipe-section">
          <h2>Ingredients{factor !== 1 && <span className="muted small"> (for {servings})</span>}</h2>
          <ul className="ingredient-list">
            {recipe.ingredients.map((l, i) =>
              isHeading(l) ? (
                <li key={i} className="ing-head">{l.replace(/:\s*$/, '')}</li>
              ) : (
                <li key={i}>{scaleLine(l, factor)}</li>
              ),
            )}
          </ul>
        </section>

        {recipe.steps.length > 0 && (
          <section className="recipe-section">
            <h2>Method</h2>
            {cooking && <p className="muted small">Tap a step when it's done. The screen stays on while you cook.</p>}
            <ol className="method">
              {recipe.steps.map((s, i) => {
                if (isHeading(s)) return <li key={i} className="step-head">{s.replace(/:\s*$/, '')}</li>;
                step++;
                return (
                  <li
                    key={i}
                    className={`step ${done.has(i) ? 'done' : ''}`}
                    onClick={() => {
                      const next = new Set(done);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      setDone(next);
                    }}
                  >
                    <span className="step-no">{step}</span>
                    <span>{s}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {recipe.notes && (
          <section className="recipe-section notes">
            <h2>Notes</h2>
            <p>{recipe.notes}</p>
          </section>
        )}

        {!cooking && (
          <>
            <label>
              Have it for tea on
              <select
                value=""
                onChange={(e) => e.target.value && act(() => api.put(`meals/${e.target.value}`, { recipeId: recipe.id, servings: servings !== recipe.servings ? servings : undefined }), 'Added to the meal plan')}
              >
                <option value="">Pick an evening…</option>
                {days.map((d) => {
                  const iso = isoDay(d);
                  const m = state.meals[iso];
                  const taken = m ? state.recipes.find((r) => r.id === m.recipeId)?.name ?? m.text : undefined;
                  return (
                    <option key={iso} value={iso}>
                      {d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
                      {taken ? ` (replaces ${taken})` : ''}
                    </option>
                  );
                })}
              </select>
            </label>
            {plannedOn.length > 0 && (
              <p className="muted small">
                Planned for {plannedOn.map((d) => new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric' })).join(', ')}
              </p>
            )}
            <div className="row between gap-top">
              {recipe.url ? <a href={recipe.url} target="_blank" rel="noreferrer" className="small">Original recipe ↗</a> : <span />}
              <button className="danger" onClick={() => confirm(`Delete "${recipe.name}"?`) && act(() => api.del(`recipes/${recipe.id}`), 'Deleted').then(onClose)}>
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
