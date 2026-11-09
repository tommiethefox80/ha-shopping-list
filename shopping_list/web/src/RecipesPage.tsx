import { useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';
import { IngredientPicker } from './IngredientPicker';
import { RecipeEditor } from './RecipeEditor';
import { RecipeView } from './RecipeView';
import type { Recipe } from './types';
import { mins, recipePic } from './util';

/** Your recipe book: search, filter by tag, import from a link or write your own. */
export function RecipesPage(props: PageProps) {
  const { state, act } = props;
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string>();
  const [open, setOpen] = useState<string>();
  const [editing, setEditing] = useState<Recipe | 'new'>();
  const [picking, setPicking] = useState<{ recipe: Recipe; servings: number }>();
  const recipe = state.recipes.find((r) => r.id === open);
  const allTags = [...new Set(state.recipes.flatMap((r) => r.tags))].sort();
  const f = q.trim().toLowerCase();
  const shown = state.recipes
    .filter((r) => !tag || r.tags.includes(tag))
    .filter((r) => !f || [r.name, r.description ?? '', ...r.tags, ...r.ingredients].some((t) => t.toLowerCase().includes(f)))
    .sort((a, b) => a.name.localeCompare(b.name));

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
        <button onClick={() => setEditing('new')}>+ New</button>
      </header>

      <form className="add-bar static" onSubmit={(e) => void importIt(e)}>
        <input type="url" inputMode="url" placeholder="Paste a recipe link to import" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="submit" disabled={busy}>{busy ? '…' : 'Import'}</button>
      </form>

      {state.recipes.length > 0 && <input className="filter" placeholder="Search recipes or ingredients…" value={q} onChange={(e) => setQ(e.target.value)} />}
      {allTags.length > 0 && (
        <div className="chips tag-filter">
          {allTags.map((t) => (
            <button key={t} className={`chip ${tag === t ? 'on' : ''}`} onClick={() => setTag(tag === t ? undefined : t)}>#{t}</button>
          ))}
        </div>
      )}

      {state.recipes.length === 0 && <p className="empty">No recipes yet. Paste a link from a recipe site, or tap + New to write your own.</p>}
      <div className="recipe-grid">
        {shown.map((r) => {
          const pic = recipePic(r);
          const t = (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);
          return (
            <button key={r.id} className="recipe-card" onClick={() => setOpen(r.id)}>
              {pic ? <img src={pic} alt="" loading="lazy" /> : <div className="recipe-card-ph">🍽️</div>}
              <span className="rc-name">{r.name}</span>
              <span className="rc-meta muted small">
                {t ? `⏱ ${mins(t)} · ` : ''}serves {r.servings}
              </span>
            </button>
          );
        })}
      </div>

      {recipe && !editing && (
        <RecipeView
          {...props}
          recipe={recipe}
          onClose={() => setOpen(undefined)}
          onEdit={() => setEditing(recipe)}
          onAddToList={(servings) => setPicking({ recipe, servings })}
        />
      )}
      {editing && (
        <RecipeEditor
          recipe={editing === 'new' ? undefined : editing}
          act={act}
          toast={props.toast}
          onClose={() => setEditing(undefined)}
          onSaved={(id) => setOpen(id)}
        />
      )}
      {picking && (
        <IngredientPicker
          {...props}
          title={picking.recipe.name}
          groups={[{ label: picking.recipe.name, recipe: picking.recipe, servings: picking.servings }]}
          onClose={() => setPicking(undefined)}
        />
      )}
    </>
  );
}
