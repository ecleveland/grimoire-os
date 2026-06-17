'use client';

import { useState } from 'react';
import type { Character, Currency } from '@/lib/types';
import { resolvePlayControls, type PlayControlProps } from './useCharacterMutation';
import { parseNonNegativeInt } from '@/lib/character-play';

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

export default function InventorySection(props: InventorySectionProps) {
  const { character } = props;
  const { editable, patch, isSaving } = resolvePlayControls(props);
  const inventory = character.inventory ?? [];
  const currency = character.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const attunedItems = (character.attunedItems ?? []).slice(0, ATTUNEMENT_SLOTS);
  const hasInventory = inventory.length > 0;
  const hasCurrency = Object.values(currency).some(v => v > 0);
  const hasAttunement = attunedItems.length > 0;
  // An owner always gets the coin editor (so they can add coins from zero);
  // a viewer only sees coins they actually hold.
  const showCurrency = hasCurrency || editable;

  // Coin adjuster: click a denomination to reveal an add/subtract amount box;
  // clicking it again (or another) closes/switches it.
  const [selectedCoin, setSelectedCoin] = useState<keyof Currency | null>(null);
  const [coinAmount, setCoinAmount] = useState('');

  const selectCoin = (denom: keyof Currency) => {
    setSelectedCoin(prev => (prev === denom ? null : denom));
    setCoinAmount('');
  };

  const adjustCoin = (sign: 1 | -1) => {
    if (!selectedCoin) return;
    const amt = parseNonNegativeInt(coinAmount);
    if (amt <= 0) return; // nothing to add/subtract
    const next = Math.max(0, currency[selectedCoin] + sign * amt);
    if (next !== currency[selectedCoin]) {
      patch({ currency: { ...currency, [selectedCoin]: next } });
    }
    setCoinAmount('');
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
            {DENOMINATIONS.map(denom => {
              const tileBody = (
                <>
                  <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    {currency[denom]}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {DENOMINATION_LABELS[denom]}
                  </div>
                </>
              );
              if (!editable) {
                return (
                  <div
                    key={denom}
                    className="p-2 border border-gray-200 dark:border-gray-600 rounded"
                  >
                    {tileBody}
                  </div>
                );
              }
              const isSelected = selectedCoin === denom;
              return (
                <button
                  key={denom}
                  type="button"
                  aria-label={`Adjust ${DENOMINATION_LABELS[denom]}`}
                  aria-pressed={isSelected}
                  onClick={() => selectCoin(denom)}
                  className={`p-2 border rounded transition-colors ${
                    isSelected
                      ? 'border-indigo-500 ring-1 ring-indigo-500 dark:border-indigo-400'
                      : 'border-gray-200 dark:border-gray-600 hover:border-indigo-400'
                  }`}
                >
                  {tileBody}
                </button>
              );
            })}
          </div>

          {editable && selectedCoin && (
            <div
              data-testid="coin-adjuster"
              className="mt-3 flex items-center justify-center gap-2"
            >
              <label
                htmlFor="coin-amount"
                className="text-xs font-semibold text-gray-500 dark:text-gray-400 w-8 text-right"
              >
                {DENOMINATION_LABELS[selectedCoin]}
              </label>
              <input
                id="coin-amount"
                type="number"
                min={0}
                aria-label="Amount"
                value={coinAmount}
                disabled={isSaving}
                onChange={e => setCoinAmount(e.target.value)}
                className="w-20 px-2 py-1 text-sm text-center rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => adjustCoin(1)}
                disabled={isSaving}
                className="px-2 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => adjustCoin(-1)}
                disabled={isSaving}
                className="px-2 py-1 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                Subtract
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
