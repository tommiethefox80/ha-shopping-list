export interface BarcodeInfo {
  name: string;
  imageUrl?: string;
}

/** Barcode -> product name (and picture) via Open Food Facts (free, no key). */
export async function lookupBarcode(ean: string): Promise<BarcodeInfo | undefined> {
  if (!/^\d{8,14}$/.test(ean)) return undefined;
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=product_name,brands,quantity,image_front_small_url`,
      { headers: { 'User-Agent': 'ShoppingListHomeAssistant/2.0' }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return undefined;
    const body = (await res.json()) as {
      status?: number;
      product?: { product_name?: string; brands?: string; quantity?: string; image_front_small_url?: string };
    };
    const p = body.product;
    if (body.status !== 1 || !p?.product_name) return undefined;
    const brand = p.brands?.split(',')[0]?.trim();
    const base = brand && !p.product_name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${p.product_name}` : p.product_name;
    return { name: [base, p.quantity].filter(Boolean).join(' ').trim(), imageUrl: p.image_front_small_url };
  } catch {
    return undefined;
  }
}
