/** Barcode -> product name via Open Food Facts (free, no key). Returns undefined if unknown. */
export async function lookupBarcode(ean: string): Promise<string | undefined> {
  if (!/^\d{8,14}$/.test(ean)) return undefined;
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${ean}.json?fields=product_name,brands,quantity`,
      { headers: { 'User-Agent': 'ShoppingListHomeAssistant/1.0' }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return undefined;
    const body = (await res.json()) as { status?: number; product?: { product_name?: string; brands?: string; quantity?: string } };
    const p = body.product;
    if (body.status !== 1 || !p?.product_name) return undefined;
    const brand = p.brands?.split(',')[0]?.trim();
    const name = brand && !p.product_name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${p.product_name}` : p.product_name;
    return [name, p.quantity].filter(Boolean).join(' ').trim();
  } catch {
    return undefined;
  }
}
