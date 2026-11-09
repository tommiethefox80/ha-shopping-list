import type { Candidate, Product } from './domain.js';
import type { TescoClient } from './tesco/driver.js';

export interface RuleOption extends Candidate {
  isMain: boolean;
}

export interface RuleDecision {
  tescoId: string;
  tescoName: string;
  reason: string;
  options: RuleOption[];
}

export const hasRule = (p?: Product): p is Product => !!p?.offerSwaps?.length;

/**
 * "Use X instead when it's on offer, otherwise the main product."
 * Checks each swap in order; the first one that's on offer and available wins.
 */
export async function decide(product: Product, tesco: TescoClient, detailed = false): Promise<RuleDecision> {
  const options: RuleOption[] = [];
  let chosen: RuleOption | undefined;
  for (const swap of product.offerSwaps ?? []) {
    const info = await tesco.offerFor(swap.tescoId, swap.tescoName).catch(() => null);
    const opt: RuleOption = { tescoId: swap.tescoId, name: swap.tescoName, available: false, ...(info ?? {}), isMain: false };
    options.push(opt);
    if (!chosen && opt.offer && opt.available) {
      chosen = opt;
      if (!detailed) break;
    }
  }
  if (detailed || !chosen) {
    const info = detailed ? await tesco.offerFor(product.tescoId, product.tescoName).catch(() => null) : null;
    options.push({ tescoId: product.tescoId, name: product.tescoName, available: true, ...(info ?? {}), isMain: true });
  }
  if (chosen) {
    return { tescoId: chosen.tescoId, tescoName: chosen.name, reason: `${chosen.name} is on offer (${chosen.offer})`, options };
  }
  return { tescoId: product.tescoId, tescoName: product.tescoName, reason: 'Nothing else on offer — using the usual product', options };
}
