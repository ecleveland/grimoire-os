'use client';

import { useEffect, useState } from 'react';
import type { Character, Currency } from '@/lib/types';
import type { PlayControlProps } from './useCharacterMutation';

type InventorySectionProps = { character: Character } & PlayControlProps;

const DENOMINATIONS = ['cp', 'sp', 'ep', 'gp', 'pp'] as const;
const DENOMINATION_LABELS: Record<string, string> = {
  cp: 'CP',
  sp: 'SP',
  ep: 'EP',
  gp: 'GP',
  pp: 'PP',
};

const ATTUNEMENT_SLOTS = 3;

export default function InventorySection({
  character,
  isOwner,
  onPatch,
  isSaving,
}: InventorySectionProps) {
  const inventory = character.inventory ?? [];
  const currency = character.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const attunedItems = (character.attunedItems ?? []).slice(0, ATTUNEMENT_SLOTS);
  const editable = !!isOwner && !!onPatch;
  const hasInventory = inventory.length > 0;
  const hasCurrency = Object.values(currency).some(v => v > 0);
  const hasAttunement = attunedItems.length > 0;
  // An owner always gets the coin editor (so they can add coins from zero);
  // a viewer only sees coins they actually hold.
  const showCurrency = hasCurrency || editable;

  // Draft mirrors the stored coins; re-seeded whenever a write refetches them.
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(DENOMINATIONS.map(d => [d, String(currency[d])]))
  );
  useEffect(() => {
    setDraft(Object.fromEntries(DENOMINATIONS.map(d => [d, String(currency[d])])));
  }, [currency.cp, currency.sp, currency.ep, currency.gp, currency.pp]);

  const commitCoin = (denom: keyof Currency) => {
    const parsed = Math.max(0, Math.floor(Number(draft[denom]) || 0));
    if (parsed === currency[denom]) return; // no-op: don't burn a version on a no-change blur
    onPatch?.({ currency: { ...currency, [denom]: parsed } });
  };

  if (!hasInventory && !showCurrency && !hasAttunement) return null;

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
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-1">
                  Name
                </th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-1">
                  Qty
                </th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-1">
                  Weight
                </th>
                <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-1">
                  Equipped
                </th>
              </tr>
            </thead>
            <tbody>
              {inventory.map(item => (
                <tr
                  key={item.name}
                  className="border-b border-gray-100 dark:border-gray-700 last:border-0"
                >
                  <td className="py-1.5 text-gray-900 dark:text-gray-100 font-medium">
                    {item.name}
                  </td>
                  <td className="py-1.5 text-gray-700 dark:text-gray-300">{item.quantity}</td>
                  <td className="py-1.5 text-gray-700 dark:text-gray-300">
                    {item.weight != null ? item.weight : '—'}
                  </td>
                  <td className="py-1.5">
                    {item.equipped ? (
                      <span
                        data-testid="equipped-yes"
                        className="text-indigo-600 dark:text-indigo-400"
                      >
                        &#10003;
                      </span>
                    ) : (
                      <span data-testid="equipped-no" className="text-gray-300 dark:text-gray-600">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Magic Item Attunement (up to 3) */}
      {hasAttunement && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase text-center mb-3">
            Attunement
          </h3>
          <div className="grid grid-cols-3 gap-2 text-center">
            {Array.from({ length: ATTUNEMENT_SLOTS }, (_, i) => {
              const item = attunedItems[i];
              return item ? (
                <div
                  key={i}
                  data-testid="attunement-slot-filled"
                  className="p-2 border border-indigo-300 dark:border-indigo-600 rounded text-sm font-medium text-gray-900 dark:text-gray-100"
                >
                  {item.name}
                </div>
              ) : (
                <div
                  key={i}
                  data-testid="attunement-slot-empty"
                  className="p-2 border border-dashed border-gray-300 dark:border-gray-600 rounded text-xs text-gray-400 dark:text-gray-500"
                >
                  Empty
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Currency (Coins) */}
      {showCurrency && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase text-center mb-3">
            Coins
          </h3>
          <div className="grid grid-cols-5 gap-2 text-center">
            {DENOMINATIONS.map(denom => (
              <div key={denom} className="p-2 border border-gray-200 dark:border-gray-600 rounded">
                {editable ? (
                  <input
                    type="number"
                    min={0}
                    aria-label={DENOMINATION_LABELS[denom]}
                    value={draft[denom]}
                    disabled={isSaving}
                    onChange={e => setDraft(d => ({ ...d, [denom]: e.target.value }))}
                    onBlur={() => commitCoin(denom)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    className="w-full text-sm font-bold text-center bg-transparent text-gray-900 dark:text-gray-100 disabled:opacity-50"
                  />
                ) : (
                  <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    {currency[denom]}
                  </div>
                )}
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
