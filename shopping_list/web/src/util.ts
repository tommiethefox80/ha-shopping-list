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

/** Multiplies the leading amount(s) in an ingredient line: "400g pasta" ×1.5 -> "600g pasta". */
export function scaleLine(line: string, factor: number): string {
  if (factor === 1) return line;
  const NUM = String.raw`(?:\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[½⅓⅔¼¾⅛])`;
  const frac: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 };
  const val = (t: string) => frac[t] ?? (t.includes('/') ? Number(t.split('/')[0]) / Number(t.split('/')[1]) : Number(t.replace(',', '.')));
  const fmt = (n: number) => {
    const r = Math.round(n * 100) / 100;
    return Math.abs(r - Math.round(r)) < 0.01 ? String(Math.round(r)) : String(r);
  };
  return line.replace(new RegExp(String.raw`^(\s*)(${NUM})(\s*[-–]\s*(${NUM}))?`), (_m, sp: string, a: string, range?: string, b?: string) =>
    `${sp}${fmt(val(a.replace(/\s/g, '')) * factor)}${range && b ? `-${fmt(val(b.replace(/\s/g, '')) * factor)}` : ''}`,
  );
}

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/(es|s)$/, '');

/** yyyy-mm-dd in local time. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const isHeading = (line: string) => /:\s*$/.test(line) && line.length <= 60 && !/^\s*[\d½¼¾⅓⅔]/.test(line);

/** 65 -> "1h 5m". */
export const mins = (m?: number) => (!m ? '' : m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`);

export const recipePic = (r: { photo?: string; imageUrl?: string }) => (r.photo ? photoUrl(r.photo) : r.imageUrl);

/** Monday of the week containing d. */
export function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
