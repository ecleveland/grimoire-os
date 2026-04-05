import type { Character } from '@/lib/types';

interface InventorySectionProps {
  character: Character;
}

const DENOMINATIONS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;
const DENOMINATION_LABELS: Record<string, string> = {
  cp: 'CP',
  sp: 'SP',
  ep: 'EP',
  gp: 'GP',
  pp: 'PP',
};

export default function InventorySection({ character }: InventorySectionProps) {
  const hasInventory = character.inventory.length > 0;
  const hasCurrency = Object.values(character.currency).some((v) => v > 0);

  if (!hasInventory && !hasCurrency) return null;

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
      {/* Equipment List */}
      {hasInventory && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase text-center mb-3">
            Equipment
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 dark:border-gray-600">
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-1">Name</th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-1">Qty</th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-1">Weight</th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-1">Equipped</th>
              </tr>
            </thead>
            <tbody>
              {character.inventory.map((item) => (
                <tr key={item.name} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                  <td className="py-1.5 text-gray-900 dark:text-gray-100 font-medium">{item.name}</td>
                  <td className="py-1.5 text-gray-700 dark:text-gray-300">{item.quantity}</td>
                  <td className="py-1.5 text-gray-700 dark:text-gray-300">{item.weight != null ? item.weight : '—'}</td>
                  <td className="py-1.5">
                    {item.equipped ? (
                      <span data-testid="equipped-yes" className="text-indigo-600 dark:text-indigo-400">&#10003;</span>
                    ) : (
                      <span data-testid="equipped-no" className="text-gray-300 dark:text-gray-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Currency (Coins) */}
      {hasCurrency && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase text-center mb-3">
            Coins
          </h3>
          <div className="grid grid-cols-5 gap-2 text-center">
            {DENOMINATIONS.map((denom) => (
              <div
                key={denom}
                className="p-2 border border-gray-200 dark:border-gray-600 rounded"
              >
                <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  {character.currency[denom]}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {DENOMINATION_LABELS[denom]}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
