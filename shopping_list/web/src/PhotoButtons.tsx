import { pickAndUploadPhoto } from './util';

/** "Take photo" (camera) and "Choose from gallery" side by side. */
export function PhotoButtons({ has, onPhoto, onError }: { has: boolean; onPhoto: (id: string) => void | Promise<void>; onError: (msg: string) => void }) {
  const pick = async (source: 'camera' | 'gallery') => {
    try {
      const id = await pickAndUploadPhoto(source);
      if (id) await onPhoto(id);
    } catch (e) {
      onError((e as Error).message);
    }
  };
  return (
    <div className="row photo-btns">
      <button type="button" className="secondary small-btn" onClick={() => void pick('camera')}>📷 {has ? 'New photo' : 'Take photo'}</button>
      <button type="button" className="secondary small-btn" onClick={() => void pick('gallery')}>🖼️ Gallery</button>
    </div>
  );
}
