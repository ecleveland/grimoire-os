import type { PrintableCard, PrintableCardGroup } from '@grimoire-os/shared';

/** Sort key parts for a card in the feature-option group. */
function optionSortKey(card: PrintableCard): [string, string] {
  return card.type === 'feature-option' ? [card.feature.name, card.name] : ['', card.name];
}

/**
 * Orders the hydrated print groups for the print page (VEG-636). The
 * feature-option group moves to sit directly after the feature group, or to the
 * end when there is no feature group, so a feature's option cards print next
 * to the features. Its cards sort by feature name, then option name, which
 * keeps one feature's options together whatever order they were added in.
 * Every other group keeps the order the endpoint returned. The input is not
 * mutated.
 */
export function orderPrintGroups(groups: PrintableCardGroup[]): PrintableCardGroup[] {
  const optionGroup = groups.find(group => group.type === 'feature-option');
  if (!optionGroup) return [...groups];

  const sorted: PrintableCardGroup = {
    ...optionGroup,
    cards: [...optionGroup.cards].sort((a, b) => {
      const [featureA, nameA] = optionSortKey(a);
      const [featureB, nameB] = optionSortKey(b);
      return featureA.localeCompare(featureB) || nameA.localeCompare(nameB);
    }),
  };

  const rest = groups.filter(group => group !== optionGroup);
  const featureAt = rest.findIndex(group => group.type === 'feature');
  const insertAt = featureAt === -1 ? rest.length : featureAt + 1;
  return [...rest.slice(0, insertAt), sorted, ...rest.slice(insertAt)];
}
