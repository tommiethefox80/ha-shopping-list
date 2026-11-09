import { useMemo, useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';
import { IngredientPicker } from './IngredientPicker';
import { RecipeEditor } from './RecipeEditor';
import { RecipeView } from './RecipeView';
import type { Meal, Recipe } from './types';
import { addDays, isoDay, mins, mondayOf, recipePic } from './util';

const QUICK = ['Leftovers', 'Takeaway', 'Eating out', 'Freezer meal', 'Something easy'];

/** Monday to Sunday, one evening meal a day. */
export function MealsPage(props: PageProps) {
  const { state } = props;
  const [weekOffset, setWeekOffset] = useState(0);
  const [choosing, setChoosing] = useState<string>();
  const [viewing, setViewing] = useState<string>();
  const [editing, setEditing] = useState<Recipe>();
  const [picking, setPicking] = useState<{ label: string; recipe: Recipe; servings: number }[]>();

  const monday = useMemo(() => addDays(mondayOf(new Date()), weekOffset * 7), [weekOffset]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const today = isoDay(new Date());
  const recipeOf = (m?: Meal) => (m?.recipeId ? state.recipes.find((r) => r.id === m.recipeId) : undefined);
  const weekLabel = weekOffset === 0 ? 'This week' : weekOffset === 1 ? 'Next week' : weekOffset === -1 ? 'Last week' : `Week of ${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  const range = `${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;

  const weekRecipes = days
    .map((d) => {
      const m = state.meals[isoDay(d)];
      const r = recipeOf(m);
      return r ? { label: `${d.toLocaleDateString('en-GB', { weekday: 'short' })} · ${r.name}`, recipe: r, servings: m?.servings ?? r.servings } : undefined;
    })
    .filter((x): x is { label: string; recipe: Recipe; servings: number } => !!x);
  const viewRecipe = state.recipes.find((r) => r.id === viewing);

  return (
    <>
      <header className="page-head">
        <h1>Meals</h1>
        <span className="muted small">Evening meals</span>
      </header>
      <div className="week-nav">
        <button className="mini" aria-label="Previous week" onClick={() => setWeekOffset(weekOffset - 1)}>‹</button>
        <div className="grow center">
          <strong>{weekLabel}</strong>
          <div className="muted small">{range}</div>
        </div>
        <button className="mini" aria-label="Next week" onClick={() => setWeekOffset(weekOffset + 1)}>›</button>
      </div>

      <ul className="planner">
        {days.map((d) => {
          const iso = isoDay(d);
          const m = state.meals[iso];
          const r = recipeOf(m);
          const pic = r && recipePic(r);
          const t = r ? (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0) : 0;
          return (
            <li key={iso} className={`${iso === today ? 'today' : ''} ${iso < today ? 'past' : ''}`}>
              <div className="day-col">
                <span className="dow">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                <span className="dom">{d.getDate()}</span>
              </div>
              {m ? (
                <button className="meal grow" onClick={() => (r ? setViewing(r.id) : setChoosing(iso))}>
                  {pic ? <img src={pic} alt="" /> : <span className="meal-emoji">{r ? '🍽️' : m.text === 'Takeaway' ? '🥡' : m.text === 'Eating out' ? '🍴' : m.text === 'Leftovers' ? '♻️' : '📝'}</span>}
                  <span className="grow">
                    <span className="meal-name">{r?.name ?? m.text}</span>
                    {r && (
                      <span className="muted small">
                        {t ? `⏱ ${mins(t)} · ` : ''}for {m.servings ?? r.servings}
                      </span>
                    )}
                  </span>
                </button>
              ) : (
                <button className="meal empty grow" onClick={() => setChoosing(iso)}>+ Plan dinner</button>
              )}
              {m && <button className="mini" aria-label="Change" onClick={() => setChoosing(iso)}>✎</button>}
            </li>
          );
        })}
      </ul>

      <button className="wide gap-top" disabled={!weekRecipes.length} onClick={() => setPicking(weekRecipes)}>
        🛒 Add the week's ingredients{weekRecipes.length ? ` (${weekRecipes.length} meal${weekRecipes.length > 1 ? 's' : ''})` : ''}
      </button>
      {state.recipes.length === 0 && <p className="muted small center">Add some recipes on the Recipes tab to plan with them, or just type what you're having.</p>}

      {choosing && <MealChooser {...props} date={choosing} onClose={() => setChoosing(undefined)} />}
      {viewRecipe && !editing && (
        <RecipeView
          {...props}
          recipe={viewRecipe}
          onClose={() => setViewing(undefined)}
          onEdit={() => setEditing(viewRecipe)}
          onAddToList={(servings) => setPicking([{ label: viewRecipe.name, recipe: viewRecipe, servings }])}
        />
      )}
      {editing && <RecipeEditor recipe={editing} act={props.act} toast={props.toast} onClose={() => setEditing(undefined)} onSaved={() => undefined} />}
      {picking && <IngredientPicker {...props} title={picking.length > 1 ? `${weekLabel}'s meals` : picking[0].recipe.name} groups={picking} onClose={() => setPicking(undefined)} />}
    </>
  );
}

function MealChooser({ state, act, date, onClose }: PageProps & { date: string; onClose: () => void }) {
  const current = state.meals[date];
  const [q, setQ] = useState('');
  const [text, setText] = useState(current?.recipeId ? '' : current?.text ?? '');
  const [servings, setServings] = useState<number | undefined>(current?.servings);
  const day = new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const f = q.trim().toLowerCase();
  const recipes = state.recipes
    .filter((r) => !f || [r.name, ...r.tags].some((t) => t.toLowerCase().includes(f)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const set = (meal: Meal) => act(() => api.put(`meals/${date}`, meal)).then(onClose);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{day}</h2>
          <button className="ghost" onClick={onClose}>Cancel</button>
        </div>
        <div className="chips">
          {QUICK.map((t) => <button key={t} className="chip" onClick={() => void set({ text: t })}>{t}</button>)}
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void set({ text }); }}>
          <input placeholder="Or type it, e.g. Fish & chips" value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" disabled={!text.trim()}>Set</button>
        </form>

        {state.recipes.length > 0 && (
          <>
            <h3>From your recipes</h3>
            <div className="row">
              <input className="grow" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
              <span className="qty">
                <span className="muted small">For</span>
                <button aria-label="Fewer" onClick={() => setServings(Math.max(1, (servings ?? 4) - 1))}>−</button>
                <span>{servings ?? '–'}</span>
                <button aria-label="More" onClick={() => setServings((servings ?? 4) + 1)}>+</button>
              </span>
            </div>
            <ul className="products">
              {recipes.map((r) => {
                const pic = recipePic(r);
                return (
                  <li key={r.id} className={current?.recipeId === r.id ? 'selected' : ''} onClick={() => void set({ recipeId: r.id, servings })}>
                    {pic ? <img src={pic} alt="" loading="lazy" /> : <div className="img-ph" />}
                    <div className="grow">
                      <div className="name">{r.name}</div>
                      <div className="muted small">serves {r.servings}{r.tags.length ? ` · ${r.tags.map((t) => `#${t}`).join(' ')}` : ''}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {current && (
          <button className="danger gap-top" onClick={() => act(() => api.del(`meals/${date}`), 'Cleared').then(onClose)}>Clear this evening</button>
        )}
      </div>
    </div>
  );
}
