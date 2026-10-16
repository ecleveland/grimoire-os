import type { CombatantLootCoinage, CombatantLootItem } from '@grimoire-os/shared';
import { formatCoinage } from '@/lib/coinage';

// Shared by the per-combatant drop and the encounter total — one copy of the
// coinage + item-list markup, so the two views can't drift apart.
export default function LootDisplay({
  coinage,
  items,
}: {
  coinage: CombatantLootCoinage;
  items: CombatantLootItem[];
}) {
  return (
    <div className="min-w-0">
      <span className="text-gray-700 dark:text-gray-300">{formatCoinage(coinage)}</span>
      {items.length > 0 && (
        <ul className="mt-1 list-disc list-inside text-gray-600 dark:text-gray-400">
          {items.map((item, j) => (
            <li key={j}>
              {item.quantity}&times; {item.name}
              {item.notes ? ` — ${item.notes}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
