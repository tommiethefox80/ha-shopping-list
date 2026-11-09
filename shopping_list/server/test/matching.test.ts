import { describe, expect, it } from 'vitest';
import { findProduct, parseItemText, parseTescoId } from '../src/matching.js';
import { defaultProducts } from '../src/store.js';

describe('matching', () => {
  const products = defaultProducts();
  it('maps the agreed defaults', () => {
    expect(findProduct(products, { name: 'beans' })?.tescoId).toBe('275205504');
    expect(findProduct(products, { name: 'Baked Beans' })?.tescoId).toBe('275205504');
    expect(findProduct(products, { name: 'chopped tomatoes' })?.tescoId).toBe('251825089');
    expect(findProduct(products, { name: 'Chopped tomato' })?.tescoId).toBe('251825089');
    expect(findProduct(products, { name: 'milk' })?.tescoId).toBe('254656399');
    expect(findProduct(products, { name: 'houmous' })).toBeUndefined();
  });
  it('matches by barcode', () => {
    products[0].eans.push('5000128000001');
    expect(findProduct(products, { name: 'whatever', ean: '5000128000001' })?.id).toBe(products[0].id);
  });
  it('parses quantities', () => {
    expect(parseItemText('2 beans')).toEqual({ name: 'beans', qty: 2 });
    expect(parseItemText('3x chopped tomatoes')).toEqual({ name: 'chopped tomatoes', qty: 3 });
    expect(parseItemText('beans x 4')).toEqual({ name: 'beans', qty: 4 });
    expect(parseItemText('7up')).toEqual({ name: '7up', qty: 1 });
    expect(parseItemText('Whole milk')).toEqual({ name: 'Whole milk', qty: 1 });
  });
  it('parses Tesco links', () => {
    expect(parseTescoId('https://www.tesco.com/shop/en-GB/products/251825089')).toBe('251825089');
    expect(parseTescoId('251825089')).toBe('251825089');
    expect(parseTescoId('beans')).toBeUndefined();
  });
});
