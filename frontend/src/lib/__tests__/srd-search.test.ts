import { describe, it, expect } from 'vitest';
import { parentDetailHref, type FeatureParent } from '@/lib/srd-search';

describe('parentDetailHref', () => {
  it('links a class parent to its detail page', () => {
    const parent: FeatureParent = { kind: 'class', id: 'cls-1', name: 'Rogue' };

    expect(parentDetailHref(parent)).toBe('/srd/classes/cls-1');
  });

  // A subclass has no page of its own: it is a card on its class page, so the
  // link needs the class id in the path and the subclass id as the anchor
  // (VEG-558). /srd/classes#sc-1 used to load the class list and scroll nowhere.
  it('links a subclass parent to its card on the class page', () => {
    const parent: FeatureParent = {
      kind: 'subclass',
      id: 'sc-1',
      name: 'Battle Master',
      classId: 'cls-1',
    };

    expect(parentDetailHref(parent)).toBe('/srd/classes/cls-1#sc-1');
  });

  it('links a race parent to its detail page', () => {
    const parent: FeatureParent = { kind: 'race', id: 'r-1', name: 'Elf' };

    expect(parentDetailHref(parent)).toBe('/srd/races/r-1');
  });

  it('links a background parent to its detail page', () => {
    const parent: FeatureParent = { kind: 'background', id: 'bg-1', name: 'Acolyte' };

    expect(parentDetailHref(parent)).toBe('/srd/backgrounds/bg-1');
  });
});
