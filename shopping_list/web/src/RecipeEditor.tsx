import { useState } from 'react';
import { api } from './api';
import type { PageProps } from './App';
import type { Recipe } from './types';
import { photoUrl, pickAndUploadPhoto } from './util';

/** Create or edit a recipe: everything you'd want on a recipe card. */
export function RecipeEditor({ recipe, act, toast, onClose, onSaved }: {
  recipe?: Recipe; act: PageProps['act']; toast: PageProps['toast']; onClose: () => void; onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(recipe?.name ?? '');
  const [description, setDescription] = useState(recipe?.description ?? '');
  const [servings, setServings] = useState(recipe?.servings ?? 4);
  const [prep, setPrep] = useState(recipe?.prepMinutes ? String(recipe.prepMinutes) : '');
  const [cook, setCook] = useState(recipe?.cookMinutes ? String(recipe.cookMinutes) : '');
  const [tags, setTags] = useState(recipe?.tags.join(', ') ?? '');
  const [ingredients, setIngredients] = useState(recipe?.ingredients.join('\n') ?? '');
  const [steps, setSteps] = useState(recipe?.steps.join('\n') ?? '');
  const [notes, setNotes] = useState(recipe?.notes ?? '');
  const [photo, setPhoto] = useState<string | undefined>(recipe?.photo);
  const pic = photo ? photoUrl(photo) : recipe?.imageUrl;

  const save = () =>
    act(async () => {
      const body = { name, description, servings, prepMinutes: prep, cookMinutes: cook, tags, ingredients, steps, notes, photo: photo ?? null };
      const r = recipe ? await api.patch<Recipe>(`recipes/${recipe.id}`, body) : await api.post<Recipe>('recipes', body);
      onSaved(r.id);
    }, 'Recipe saved').then(onClose);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{recipe ? 'Edit recipe' : 'New recipe'}</h2>
          <button className="ghost" onClick={onClose}>Cancel</button>
        </div>
        <div className="row photo-row">
          {pic ? <img className="photo" src={pic} alt="" /> : <div className="photo empty-photo">No photo</div>}
          <div className="grow">
            <label>Name<input value={name} placeholder="e.g. Chicken stir fry" onChange={(e) => setName(e.target.value)} /></label>
            <button
              className="secondary small-btn"
              onClick={async () => {
                try {
                  const id = await pickAndUploadPhoto();
                  if (id) setPhoto(id);
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              📷 {pic ? 'Change photo' : 'Add a photo'}
            </button>
          </div>
        </div>
        <label>Short description<input value={description} placeholder="e.g. Quick weeknight favourite" onChange={(e) => setDescription(e.target.value)} /></label>
        <div className="row">
          <label className="grow">Serves<input type="number" min={1} max={50} value={servings} onChange={(e) => setServings(Number(e.target.value))} /></label>
          <label className="grow">Prep (mins)<input inputMode="numeric" value={prep} onChange={(e) => setPrep(e.target.value.replace(/\D/g, ''))} /></label>
          <label className="grow">Cook (mins)<input inputMode="numeric" value={cook} onChange={(e) => setCook(e.target.value.replace(/\D/g, ''))} /></label>
        </div>
        <label>Tags (comma separated)<input value={tags} placeholder="e.g. quick, chicken, kids" onChange={(e) => setTags(e.target.value)} /></label>
        <label>
          Ingredients, one per line
          <textarea rows={9} value={ingredients} placeholder={'500g chicken breast\n1 pack stir fry veg\n2 nests noodles\nFor the sauce:\n3 tbsp soy sauce'} onChange={(e) => setIngredients(e.target.value)} />
        </label>
        <p className="muted small">A line ending in “:” becomes a heading, e.g. “For the sauce:”.</p>
        <label>Method, one step per line<textarea rows={7} value={steps} onChange={(e) => setSteps(e.target.value)} /></label>
        <label>Notes<textarea rows={3} value={notes} placeholder="Swaps, tips, what the kids think…" onChange={(e) => setNotes(e.target.value)} /></label>
        <button className="wide gap-top" disabled={!name.trim()} onClick={() => void save()}>Save recipe</button>
      </div>
    </div>
  );
}
