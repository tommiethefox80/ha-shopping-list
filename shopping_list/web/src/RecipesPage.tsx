import { useMemo, useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';
import type { Recipe } from './types';
import { isoDay, norm, scaleLine } from './util';

type Pick = { key: string; line: string; recipe: string; name: string; checked: boolean; onList: boolean };

/** Recipes: import from a link or type in, add ingredients to the list, plan the week. */
export function RecipesPage(props: PageProps) {
  const { state, act, list } = props;
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string>();
  const [writing, setWriting] = useState(false);
  const [picking, setPicking] = useState<{ title: string; recipes: { recipe: Recipe; servings: number }[] }>();
  const recipe = state.recipes.find((r) => r.id === open);

  const days = useMemo(() => {
    const out: { iso: string; label: string }[] = [];
    const d = new Date();
    for (let i = 0; i < 7; i++) {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      out.push({ iso: isoDay(x), label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }) });
    }
    return out;
  }, []);
  const planned = days.flatMap((d) => (state.plan[d.iso] ?? []).map((id) => state.recipes.find((r) => r.id === id)).filter((r): r is Recipe => !!r));

  const importIt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    await act(async () => {
      const r = await api.post<Recipe>('recipes/import', { url });
      setUrl('');
      setOpen(r.id);
    }, 'Recipe imported');
    setBusy(false);
  };

  return (
    <>
      <header className="page-head">
        <h1>Recipes</h1>
        <button onClick={() => setWriting(true)}>+ Type one</button>
      </header>

      <section className="usuals">
        <div className="usuals-head">
          <span>This week</span>
          {planned.length > 0 && (
            <button className="link" onClick={() => setPicking({ title: "This week's meals", recipes: planned.map((r) => ({ recipe: r, servings: r.servings })) })}>
              🛒 Add the week's ingredients
            </button>
          )}
        </div>
        <ul className="week">
          {days.map((d) => (
            <li key={d.iso}>
              <span className="day">{d.label}</span>
              <span className="grow">
                {(state.plan[d.iso] ?? []).map((id) => {
                  const r = state.recipes.find((x) => x.id === id);
                  return r ? (
                    <button key={id} className="chip on" onClick={() => setOpen(id)}>{r.name}</button>
                  ) : null;
                })}
              </span>
              <select
                className="day-add"
                value=""
                aria-label={`Plan a recipe for ${d.label}`}
                onChange={(e) => e.target.value && act(() => api.put(`plan/${d.iso}`, { recipeIds: [...(state.plan[d.iso] ?? []), e.target.value] }))}
              >
                <option value="">＋</option>
                {state.recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </li>
          ))}
        </ul>
        {state.recipes.length === 0 && <p className="muted small">Import or type a recipe, then plan it for a day.</p>}
      </section>

      <form className="add-bar" onSubmit={(e) => void importIt(e)}>
        <input type="url" inputMode="url" placeholder="Paste a recipe link (BBC Good Food, etc.)" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="submit" disabled={busy}>{busy ? '…' : 'Import'}</button>
      </form>

      <ul className="products">
        {state.recipes.map((r) => (
          <li key={r.id} onClick={() => setOpen(r.id)}>
            {r.imageUrl ? <img src={r.imageUrl} alt="" loading="lazy" /> : <div className="img-ph" />}
            <div className="grow">
              <div className="name">{r.name}</div>
              <div className="muted small">Serves {r.servings} · {r.ingredients.length} ingredients</div>
            </div>
          </li>
        ))}
      </ul>

      {recipe && (
        <RecipeSheet
          {...props}
          recipe={recipe}
          days={days}
          onClose={() => setOpen(undefined)}
          onPick={(servings) => setPicking({ title: recipe.name, recipes: [{ recipe, servings }] })}
        />
      )}
      {writing && <WriteRecipe act={act} onClose={() => setWriting(false)} onSaved={(id) => setOpen(id)} />}
      {picking && <IngredientPicker {...props} title={picking.title} recipes={picking.recipes} listName={list.name} onClose={() => setPicking(undefined)} />}
    </>
  );
}

function RecipeSheet({ state, act, recipe, days, onClose, onPick }: PageProps & {
  recipe: Recipe; days: { iso: string; label: string }[]; onClose: () => void; onPick: (servings: number) => void;
}) {
  const [servings, setServings] = useState(recipe.servings);
  const [showSteps, setShowSteps] = useState(false);
  const factor = servings / recipe.servings;
  const plannedOn = days.filter((d) => state.plan[d.iso]?.includes(recipe.id));

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{recipe.name}</h2>
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
        {recipe.imageUrl && <img className="recipe-img" src={recipe.imageUrl} alt="" />}
        <div className="row between">
          <div className="qty">
            <span className="muted">Serves</span>
            <button onClick={() => setServings(Math.max(1, servings - 1))} aria-label="Fewer">−</button>
            <span>{servings}</span>
            <button onClick={() => setServings(servings + 1)} aria-label="More">+</button>
          </div>
          {recipe.url && <a href={recipe.url} target="_blank" rel="noreferrer" className="small">Open original ↗</a>}
        </div>
        <ul className="ingredients">
          {recipe.ingredients.map((l, i) => <li key={i}>{scaleLine(l, factor)}</li>)}
        </ul>
        <button className="wide" onClick={() => onPick(servings)}>🛒 Choose ingredients to add…</button>
        <label>
          Plan it for
          <select
            value=""
            onChange={(e) => e.target.value && act(() => api.put(`plan/${e.target.value}`, { recipeIds: [...(state.plan[e.target.value] ?? []), recipe.id] }), 'Planned')}
          >
            <option value="">Pick a day…</option>
            {days.map((d) => <option key={d.iso} value={d.iso}>{d.label}</option>)}
          </select>
        </label>
        {plannedOn.length > 0 && (
          <p className="small">
            Planned: {plannedOn.map((d) => (
              <button key={d.iso} className="chip on" onClick={() => act(() => api.put(`plan/${d.iso}`, { recipeIds: state.plan[d.iso].filter((x) => x !== recipe.id) }), 'Removed from plan')}>
                {d.label} ✕
              </button>
            ))}
          </p>
        )}
        {recipe.steps.length > 0 && (
          <>
            <button className="link" onClick={() => setShowSteps(!showSteps)}>{showSteps ? '▾' : '▸'} Method</button>
            {showSteps && <ol className="steps">{recipe.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
          </>
        )}
        <div className="row between gap-top">
          <button className="danger" onClick={() => confirm(`Delete "${recipe.name}"?`) && act(() => api.del(`recipes/${recipe.id}`), 'Deleted').then(onClose)}>Delete recipe</button>
        </div>
      </div>
    </div>
  );
}

/** Tick which ingredients to add. Staples (salt, oil…) and things already on the list start unticked. */
function IngredientPicker({ state, act, list, title, recipes, listName, onClose }: PageProps & {
  title: string; recipes: { recipe: Recipe; servings: number }[]; listName: string; onClose: () => void;
}) {
  const onListNames = useMemo(
    () => new Set(state.items.filter((i) => i.listId === list.id && i.status === 'todo').flatMap((i) => [norm(i.name), ...(i.resolved.detail ? [norm(i.resolved.detail)] : [])])),
    [state.items, list.id],
  );
  const [picks, setPicks] = useState<Pick[]>(() =>
    recipes.flatMap(({ recipe, servings }) =>
      recipe.ingredients.map((l, idx) => {
        const name = recipe.parsed[idx]?.name ?? l;
        const onList = onListNames.has(norm(name));
        return { key: `${recipe.id}:${idx}`, line: scaleLine(l, servings / recipe.servings), recipe: recipe.name, name, checked: !onList && !recipe.parsed[idx]?.staple, onList };
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
        {recipes.map(({ recipe }) => (
          <section key={recipe.id}>
            {recipes.length > 1 && <h3>{recipe.name}</h3>}
            <ul className="pick">
              {picks.filter((p) => p.key.startsWith(recipe.id)).map((p) => (
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
          onClick={() => act(() => api.post('recipes/add-to-list', { listId: list.id, lines: chosen.map((p) => ({ line: p.line, recipe: p.recipe })) }), `Added ${chosen.length} to ${listName}`).then(onClose)}
        >
          🛒 Add {chosen.length} to {listName}
        </button>
      </div>
    </div>
  );
}

function WriteRecipe({ act, onClose, onSaved }: { act: PageProps['act']; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState('');
  const [servings, setServings] = useState(4);
  const [ingredients, setIngredients] = useState('');
  const [steps, setSteps] = useState('');
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>New recipe</h2>
          <button className="ghost" onClick={onClose}>Cancel</button>
        </div>
        <label>Name<input value={name} placeholder="e.g. Chicken stir fry" onChange={(e) => setName(e.target.value)} /></label>
        <label className="grow">Serves<input type="number" min={1} max={50} value={servings} onChange={(e) => setServings(Number(e.target.value))} /></label>
        <label>Ingredients (one per line)<textarea rows={8} value={ingredients} placeholder={'500g chicken breast\n1 pack stir fry veg\n2 nests noodles'} onChange={(e) => setIngredients(e.target.value)} /></label>
        <label>Method (optional, one step per line)<textarea rows={4} value={steps} onChange={(e) => setSteps(e.target.value)} /></label>
        <button
          className="wide gap-top"
          disabled={!name.trim() || !ingredients.trim()}
          onClick={() => act(async () => {
            const r = await api.post<{ id: string }>('recipes', { name, servings, ingredients, steps });
            onSaved(r.id);
          }, 'Saved').then(onClose)}
        >
          Save recipe
        </button>
      </div>
    </div>
  );
}
