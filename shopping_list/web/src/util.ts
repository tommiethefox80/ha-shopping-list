/** Pence -> "£1.50". */
export const money = (p?: number) => (p === undefined || p === null ? '' : `£${(p / 100).toFixed(2)}`);

/** "1.5", "£1.50", "150p" -> 150 pence; '' -> null. */
export function parseMoney(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (t.endsWith('p')) {
    const n = Number(t.slice(0, -1));
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  const n = Number(t.replace(/[£,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export const photoUrl = (id: string) => `api/photos/${id}.jpg`;

/** Take or choose a photo, shrink it on the phone, upload it; returns the photo id. */
export async function pickAndUploadPhoto(): Promise<string | undefined> {
  const file = await new Promise<File | undefined>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.onchange = () => resolve(input.files?.[0]);
    input.click();
  });
  if (!file) return undefined;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read photo'))), 'image/jpeg', 0.8));
  const res = await fetch('api/photos', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob });
  if (!res.ok) throw new Error('Photo upload failed');
  return ((await res.json()) as { id: string }).id;
}

export const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};
