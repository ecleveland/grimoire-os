import { describe, it, expect } from 'vitest';
import type { PrintableCardGroup, PrintableFeatureOptionCard } from '@grimoire-os/shared';
import { orderPrintGroups } from '@/lib/print-group-order';

function option(featureName: string, name: string): PrintableFeatureOptionCard {
  return {
    type: 'feature-option',
    id: `${featureName}::${name}`,
    name,
    feature: { id: featureName, name: featureName },
    parent: { kind: 'class', id: 'cls-1', name: 'Warlock' },
    description: 'Text.',
  };
}

const spells: PrintableCardGroup = { type: 'spell', cards: [] };
const monsters: PrintableCardGroup = { type: 'monster', cards: [] };
const features: PrintableCardGroup = { type: 'feature', cards: [] };
const options: PrintableCardGroup = {
  type: 'feature-option',
  cards: [option('Eldritch Invocations', 'Armor of Shadows')],
};

describe('orderPrintGroups', () => {
  it('keeps the order when there is no feature-option group', () => {
    expect(orderPrintGroups([spells, features, monsters]).map(g => g.type)).toEqual([
      'spell',
      'feature',
      'monster',
    ]);
  });

  it('moves the feature-option group directly after the feature group', () => {
    const ordered = orderPrintGroups([options, spells, features, monsters]);

    expect(ordered.map(g => g.type)).toEqual(['spell', 'feature', 'feature-option', 'monster']);
  });

  it('moves the feature-option group to the end when there is no feature group', () => {
    const ordered = orderPrintGroups([options, spells, monsters]);

    expect(ordered.map(g => g.type)).toEqual(['spell', 'monster', 'feature-option']);
  });

  it('sorts option cards by feature name, then option name, without mutating the input', () => {
    const cards = [
      option('Metamagic', 'Careful Spell'),
      option('Eldritch Invocations', 'Armor of Shadows'),
      option('Eldritch Invocations', 'Agonizing Blast'),
    ];
    const input: PrintableCardGroup[] = [{ type: 'feature-option', cards }];

    const [group] = orderPrintGroups(input);

    expect(group.cards.map(c => c.id)).toEqual([
      'Eldritch Invocations::Agonizing Blast',
      'Eldritch Invocations::Armor of Shadows',
      'Metamagic::Careful Spell',
    ]);
    expect(input[0].cards).toBe(cards);
    expect(cards.map(c => c.name)).toEqual([
      'Careful Spell',
      'Armor of Shadows',
      'Agonizing Blast',
    ]);
  });
});
