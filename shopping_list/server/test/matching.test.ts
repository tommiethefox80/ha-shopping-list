import { describe, expect, it } from 'vitest';
import { findProduct, parseItemText } from '../src/matching.js';
import { defaultProducts } from '../src/store.js';

describe('matching', () => {
  const products = defaultProducts();
  const label = (name: string, ean?: string) => findProduct(products, { name, ean })?.label;
  it('maps names, aliases and plurals to products', () => {
    expect(label('beans')).toBe('Beans');
    expect(label('Baked Beans')).toBe('Beans');
    expect(label('chopped tomato')).toBe('Chopped tomatoes');
    expect(label('milk')).toBe('Whole milk');
    expect(label('houmous')).toBeUndefined();
  });
  it('matches by barcode', () => {
    products[0].eans.push('5000128000001');
    expect(label('whatever', '5000128000001')).toBe('Whole milk');
  });
  it('parses quantities', () => {
    expect(parseItemText('2 beans')).toEqual({ name: 'beans', qty: 2 });
    expect(parseItemText('3x chopped tomatoes')).toEqual({ name: 'chopped tomatoes', qty: 3 });
    expect(parseItemText('beans x 4')).toEqual({ name: 'beans', qty: 4 });
    expect(parseItemText('7up')).toEqual({ name: '7up', qty: 1 });
  });
});
