import type { SrdItem } from '@/lib/types';
import Markdown from '@/components/Markdown';

/**
 * Expanded item view for the unified-search result card (VEG-296): the
 * stat-line facts (cost, weight, damage, AC), properties, and the markdown
 * description (PDF-extracted item text embeds GFM tables).
 */
export default function ItemDetail({ item }: { item: SrdItem }) {
  const facts: [string, string | undefined][] = [
    ['Cost', item.cost],
    ['Weight', item.weight != null ? String(item.weight) : undefined],
    [
      'Damage',
      item.damage ? `${item.damage}${item.damageType ? ` ${item.damageType}` : ''}` : undefined,
    ],
    ['Armor Class', item.armorClass],
    [
      'Strength Requirement',
      item.strengthRequirement != null ? String(item.strengthRequirement) : undefined,
    ],
  ];
  const presentFacts = facts.filter((f): f is [string, string] => Boolean(f[1]));

  return (
    <div className="space-y-3">
      {presentFacts.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
          {presentFacts.map(([label, value]) => (
            <span key={label}>
              {label}: {value}
            </span>
          ))}
        </div>
      )}
      {item.stealthDisadvantage && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Disadvantage on Dexterity (Stealth) checks.
        </p>
      )}
      {item.properties.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.properties.map(p => (
            <span
              key={p}
              className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
            >
              {p}
            </span>
          ))}
        </div>
      )}
      {item.description && <Markdown>{item.description}</Markdown>}
    </div>
  );
}
