'use client';

import { useState } from 'react';
import type { Character, Currency, InventoryItem, SrdItem } from '@/lib/types';
import { resolvePlayControls, type PlayControlProps } from './useCharacterMutation';
import { parseNonNegativeInt } from '@/lib/character-play';
import {
  addInventoryItem,
  carryingCapacity,
  removeInventoryItemAt,
  toggleEquippedAt,
  totalInventoryWeight,
  updateInventoryItemAt,
} from '@/lib/character-inventory';
import SrdItemSearch from '@/components/SrdItemSearch';

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

const textInputClass =
  'px-2 py-1 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white';

/** Parse an optional weight field: blank → undefined, else a non-negative number. */
function parseWeight(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : undefined;
}

export default function InventorySection(props: InventorySectionProps) {
  const { character } = props;
  const { editable, patch, isSaving } = resolvePlayControls(props);
  const inventory = character.inventory ?? [];
  const currency = character.currency ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const attunedItems = (character.attunedItems ?? []).slice(0, ATTUNEMENT_SLOTS);
  const hasInventory = inventory.length > 0;
  const hasCurrency = Object.values(currency).some(v => v > 0);
  const hasAttunement = attunedItems.length > 0;
  // An owner always gets the editors (so they can add from zero); a viewer only
  // sees the content they actually hold.
  const showInventory = hasInventory || editable;
  const showCurrency = hasCurrency || editable;

  // Coin adjuster: click a denomination to reveal an add/subtract amount box;
  // clicking it again (or another) closes/switches it.
  const [selectedCoin, setSelectedCoin] = useState<keyof Currency | null>(null);
  const [coinAmount, setCoinAmount] = useState('');

  // Inline row editor: the index being edited (or null) plus its draft fields.
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editWeight, setEditWeight] = useState('');

  // Add-item form drafts. `addItemId` links to the catalog when filled from the
  // picker; `addDetail` is the catalog blurb shown after a pick.
  const [addName, setAddName] = useState('');
  const [addQty, setAddQty] = useState('1');
  const [addWeight, setAddWeight] = useState('');
  const [addItemId, setAddItemId] = useState<string | undefined>(undefined);
  const [addDetail, setAddDetail] = useState<string | null>(null);

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

  const startEdit = (index: number) => {
    const item = inventory[index];
    setEditIndex(index);
    setEditName(item.name);
    setEditQty(String(item.quantity));
    setEditWeight(item.weight != null ? String(item.weight) : '');
  };

  const cancelEdit = () => setEditIndex(null);

  const saveEdit = (index: number) => {
    const name = editName.trim();
    if (!name) return;
    patch({
      inventory: updateInventoryItemAt(inventory, index, {
        name,
        quantity: Math.max(1, parseNonNegativeInt(editQty) || 1),
        weight: parseWeight(editWeight),
      }),
    });
    setEditIndex(null);
  };

  const removeItem = (index: number) => {
    if (editIndex === index) setEditIndex(null);
    patch({ inventory: removeInventoryItemAt(inventory, index) });
  };

  const toggleEquipped = (index: number) => {
    patch({ inventory: toggleEquippedAt(inventory, index) });
  };

  const fillFromCatalog = (item: SrdItem) => {
    setAddName(item.name);
    setAddWeight(item.weight != null ? String(item.weight) : '');
    setAddItemId(item.id);
    setAddDetail(item.category + (item.rarity ? ` · ${item.rarity}` : ''));
  };

  const resetAddForm = () => {
    setAddName('');
    setAddQty('1');
    setAddWeight('');
    setAddItemId(undefined);
    setAddDetail(null);
  };

  const addItem = () => {
    const name = addName.trim();
    if (!name) return;
    const item: InventoryItem = {
      name,
      quantity: Math.max(1, parseNonNegativeInt(addQty) || 1),
      equipped: false,
    };
    const weight = parseWeight(addWeight);
    if (weight != null) item.weight = weight;
    if (addItemId) item.itemId = addItemId;
    patch({ inventory: addInventoryItem(inventory, item) });
    resetAddForm();
  };

  if (!showInventory && !showCurrency && !hasAttunement) return null;

  const capacity = carryingCapacity(character.abilityScores.strength, character.size);
  const carried = totalInventoryWeight(inventory);
  const overCapacity = carried > capacity;

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
      {/* Equipment List */}
      {showInventory && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase text-center mb-3">
            Equipment
          </h3>
          {hasInventory && (
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
                  {editable && (
                    <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 pb-1">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {inventory.map((item, index) =>
                  editable && editIndex === index ? (
                    <tr
                      key={index}
                      className="border-b border-gray-100 dark:border-gray-700 last:border-0"
                    >
                      <td className="py-1.5">
                        <input
                          aria-label="Item name"
                          value={editName}
                          disabled={isSaving}
                          onChange={e => setEditName(e.target.value)}
                          className={`w-full ${textInputClass}`}
                        />
                      </td>
                      <td className="py-1.5">
                        <input
                          type="number"
                          min={1}
                          aria-label="Item quantity"
                          value={editQty}
                          disabled={isSaving}
                          onChange={e => setEditQty(e.target.value)}
                          className={`w-16 ${textInputClass}`}
                        />
                      </td>
                      <td className="py-1.5">
                        <input
                          type="number"
                          min={0}
                          aria-label="Item weight"
                          value={editWeight}
                          disabled={isSaving}
                          onChange={e => setEditWeight(e.target.value)}
                          className={`w-16 ${textInputClass}`}
                        />
                      </td>
                      <td className="py-1.5" />
                      <td className="py-1.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => saveEdit(index)}
                          disabled={isSaving}
                          className="px-2 py-1 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={isSaving}
                          className="ml-1 px-2 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr
                      key={index}
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
                        {editable ? (
                          <button
                            type="button"
                            aria-label={`${item.equipped ? 'Unequip' : 'Equip'} ${item.name}`}
                            aria-pressed={item.equipped}
                            onClick={() => toggleEquipped(index)}
                            disabled={isSaving}
                            className="disabled:opacity-50"
                          >
                            {item.equipped ? (
                              <span
                                data-testid="equipped-yes"
                                className="text-indigo-600 dark:text-indigo-400"
                              >
                                &#10003;
                              </span>
                            ) : (
                              <span
                                data-testid="equipped-no"
                                className="text-gray-300 dark:text-gray-600"
                              >
                                —
                              </span>
                            )}
                          </button>
                        ) : item.equipped ? (
                          <span
                            data-testid="equipped-yes"
                            className="text-indigo-600 dark:text-indigo-400"
                          >
                            &#10003;
                          </span>
                        ) : (
                          <span
                            data-testid="equipped-no"
                            className="text-gray-300 dark:text-gray-600"
                          >
                            —
                          </span>
                        )}
                      </td>
                      {editable && (
                        <td className="py-1.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            aria-label={`Edit ${item.name}`}
                            onClick={() => startEdit(index)}
                            disabled={isSaving}
                            className="px-2 py-1 text-xs font-medium rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${item.name}`}
                            onClick={() => removeItem(index)}
                            disabled={isSaving}
                            className="ml-1 px-2 py-1 text-xs font-medium rounded border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}

          {/* Carrying-capacity readout */}
          {hasInventory && (
            <p
              data-testid="carrying-capacity"
              className={`mt-2 text-xs ${
                overCapacity
                  ? 'text-red-600 dark:text-red-400 font-semibold'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Carried {carried} / {capacity} lb{overCapacity ? ' — over capacity' : ''}
            </p>
          )}

          {/* Add-item form (owner only) */}
          {editable && (
            <div data-testid="add-item-form" className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  aria-label="New item name"
                  placeholder="Item name"
                  value={addName}
                  disabled={isSaving}
                  onChange={e => {
                    setAddName(e.target.value);
                    // Free-typing breaks the catalog link from a prior pick.
                    setAddItemId(undefined);
                    setAddDetail(null);
                  }}
                  className={`flex-1 min-w-[8rem] ${textInputClass}`}
                />
                <input
                  type="number"
                  min={1}
                  aria-label="New item quantity"
                  value={addQty}
                  disabled={isSaving}
                  onChange={e => setAddQty(e.target.value)}
                  className={`w-16 ${textInputClass}`}
                />
                <input
                  type="number"
                  min={0}
                  aria-label="New item weight"
                  placeholder="lb"
                  value={addWeight}
                  disabled={isSaving}
                  onChange={e => setAddWeight(e.target.value)}
                  className={`w-16 ${textInputClass}`}
                />
                <button
                  type="button"
                  onClick={addItem}
                  disabled={isSaving || addName.trim() === ''}
                  className="px-3 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Add item
                </button>
              </div>
              {addDetail && (
                <p
                  data-testid="catalog-detail"
                  className="text-xs text-indigo-600 dark:text-indigo-400"
                >
                  Linked to catalog: {addDetail}
                </p>
              )}
              <SrdItemSearch
                onSelect={fillFromCatalog}
                disabled={isSaving}
                placeholder="Search the catalog to autofill…"
              />
            </div>
          )}
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
