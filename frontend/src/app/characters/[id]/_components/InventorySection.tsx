'use client';

import { useEffect, useState } from 'react';
import type {
  AttunedItem,
  Character,
  Currency,
  GearMeta,
  InventoryItem,
  SrdItem,
} from '@/lib/types';
import type { ComputedEncumbrance, ComputedSpeed } from '@grimoire-os/shared';
import { gearMetaFromItem, isGearCategory } from '@grimoire-os/shared';
import { resolvePlayControls, type PlayControlProps } from './useCharacterMutation';
import { parseNonNegativeInt } from '@/lib/character-play';
import {
  addInventoryItem,
  removeInventoryItemAt,
  stripCatalogLinkAt,
  toggleEquippedAt,
  updateInventoryItemAt,
} from '@/lib/character-inventory';
import { ATTUNEMENT_MAX, addAttunedItem, removeAttunedItemAt } from '@/lib/character-attunement';
import { DEFAULT_SPEED, EMPTY_CURRENCY } from '@/lib/character-defaults';
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

const ATTUNEMENT_SLOTS = ATTUNEMENT_MAX;

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
  const currency = character.currency ?? EMPTY_CURRENCY;
  // Display caps at 3 slots, but the add/remove handlers mutate the full stored
  // array so a (DTO-unreachable) >3 state can't silently drop the hidden tail.
  const storedAttunedItems = character.attunedItems ?? [];
  const attunedItems = storedAttunedItems.slice(0, ATTUNEMENT_SLOTS);
  const hasInventory = inventory.length > 0;
  const hasCurrency = Object.values(currency).some(v => v > 0);
  const hasAttunement = attunedItems.length > 0;
  // An owner always gets the editors (so they can add from zero); a viewer only
  // sees the content they actually hold.
  const showInventory = hasInventory || editable;
  const showCurrency = hasCurrency || editable;
  const showAttunement = hasAttunement || editable;
  const attunementFull = storedAttunedItems.length >= ATTUNEMENT_SLOTS;

  // Coin adjuster: click a denomination to reveal an add/subtract amount box;
  // clicking it again (or another) closes/switches it.
  const [selectedCoin, setSelectedCoin] = useState<keyof Currency | null>(null);
  const [coinAmount, setCoinAmount] = useState('');

  // Inline row editor: the index being edited (or null) plus its draft fields.
  // The index is positional, so any change that reorders/replaces `inventory`
  // must close the editor or a Save would write the draft onto the wrong row.
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('');
  const [editWeight, setEditWeight] = useState('');

  // Close any open editor when the character is refetched (a successful write,
  // or a concurrent/409 reload via useCharacterMutation bumps `version`): the
  // refetched inventory may have shifted, invalidating the positional editIndex.
  useEffect(() => {
    setEditIndex(null);
  }, [character.version]);

  // Add-item form drafts. `addItemId` links to the catalog when filled from the
  // picker; `addDetail` is the catalog blurb shown after a pick; `addGear` is
  // the armor/weapon metadata snapshotted from the pick (VEG-410).
  const [addName, setAddName] = useState('');
  const [addQty, setAddQty] = useState('1');
  const [addWeight, setAddWeight] = useState('');
  const [addItemId, setAddItemId] = useState<string | undefined>(undefined);
  const [addDetail, setAddDetail] = useState<string | null>(null);
  const [addGear, setAddGear] = useState<GearMeta | undefined>(undefined);
  // Set when a picked gear-category item yields no snapshot (VEG-460), so the
  // equip-does-nothing behavior (magic weapons, "+N" body armor) is discoverable.
  const [addGearHint, setAddGearHint] = useState<string | null>(null);

  // Add-attunement form drafts (separate from the inventory add form).
  const [attuneName, setAttuneName] = useState('');
  const [attuneItemId, setAttuneItemId] = useState<string | undefined>(undefined);

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
    const fields: Partial<InventoryItem> = {
      name,
      quantity: Math.max(1, parseNonNegativeInt(editQty) || 1),
    };
    // A blank weight field keeps the item's current weight rather than silently
    // zeroing it out — clearing the box to retype shouldn't drop carried weight.
    const weight = parseWeight(editWeight);
    if (weight != null) fields.weight = weight;
    let next = updateInventoryItemAt(inventory, index, fields);
    // A rename repurposes the row: drop the catalog link + gear snapshot so the
    // old item's AC/weapon stats don't silently ride along (VEG-410). Compare
    // trimmed-to-trimmed — a stored name with stray whitespace (the DTO doesn't
    // trim) must not turn a quantity edit into a spurious rename.
    if (name !== (inventory[index]?.name ?? '').trim()) next = stripCatalogLinkAt(next, index);
    patch({ inventory: next });
    setEditIndex(null);
  };

  const removeItem = (index: number) => {
    // Always close the editor: removing any row reindexes the array, so a still-
    // open positional editIndex could otherwise Save onto the wrong item.
    setEditIndex(null);
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
    // Snapshot armor/weapon stats at pick time (VEG-410) so equipping the item
    // can drive derived AC/weapons; non-gear items map to null → no snapshot.
    const meta = gearMetaFromItem(item);
    setAddGear(meta ?? undefined);
    // A gear-category item that yields no snapshot (magic weapons, "+N" body
    // armor) contributes nothing to derived stats — surface that so it's not a
    // silent no-op (VEG-460).
    setAddGearHint(
      !meta && isGearCategory(item.category)
        ? 'No derivable stats — manage AC/weapons manually.'
        : null
    );
  };

  const resetAddForm = () => {
    setAddName('');
    setAddQty('1');
    setAddWeight('');
    setAddItemId(undefined);
    setAddDetail(null);
    setAddGear(undefined);
    setAddGearHint(null);
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
    if (addGear) item.gear = addGear;
    patch({ inventory: addInventoryItem(inventory, item) });
    resetAddForm();
  };

  const fillAttuneFromCatalog = (item: SrdItem) => {
    setAttuneName(item.name);
    setAttuneItemId(item.id);
  };

  const addAttuned = () => {
    const name = attuneName.trim();
    if (!name || attunementFull) return;
    const item: AttunedItem = { name };
    if (attuneItemId) item.itemId = attuneItemId;
    patch({ attunedItems: addAttunedItem(storedAttunedItems, item) });
    setAttuneName('');
    setAttuneItemId(undefined);
  };

  const removeAttuned = (index: number) => {
    patch({ attunedItems: removeAttunedItemAt(storedAttunedItems, index) });
  };

  if (!showInventory && !showCurrency && !showAttunement) return null;

  // Carrying state is derived server-side (VEG-490): capacity, carried weight and
  // the tier all come from the computed block, so this readout and the stat bar
  // cannot disagree about one character the way they did while encumbrance was
  // applied here alone. Absent under version skew (a pre-VEG-490 payload) —
  // degrade to no readout rather than crashing the sheet, the same contract
  // StatsBar's speed and CombatBar's derived AC follow.
  // Annotated `| undefined` deliberately, though `ComputedStats` declares both
  // non-optional: an older payload omits them, and without this the guards below
  // read as dead code on a non-nullable field — the exact thing a cleanup pass
  // (or a no-unnecessary-condition lint) would delete, reopening the crash.
  // StatsBar does the same for `speed`.
  const encumbrance: ComputedEncumbrance | undefined = character.computed.encumbrance;
  const speed: ComputedSpeed | undefined = character.computed.speed;
  const overCapacity = encumbrance ? encumbrance.carried > encumbrance.capacity : false;
  // The "before → after" pair the readout shows: speed less exhaustion only,
  // then the final effective value. Display arithmetic on already-derived
  // numbers, not a second derivation of the rule.
  //
  // The skew branch covers a payload carrying `encumbrance` but no `speed` (the
  // two arrived in different releases): fall back to the stored column and
  // subtract the server's own tier penalty, which reproduces the pre-VEG-490
  // render. Still not a re-derivation — the penalty is read, not classified.
  const storedSpeed = character.speed ?? DEFAULT_SPEED;
  const speedBeforeLoad = speed ? speed.base - speed.exhaustionPenalty : storedSpeed;
  const speedAfterLoad = speed
    ? speed.effective
    : Math.max(0, storedSpeed - (encumbrance?.speedPenalty ?? 0));
  const encumbranceLabel =
    encumbrance?.tier === 'heavily-encumbered' ? 'Heavily encumbered' : 'Encumbered';

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
          {hasInventory && encumbrance && (
            <p
              data-testid="carrying-capacity"
              className={`mt-2 text-xs ${
                overCapacity
                  ? 'text-red-600 dark:text-red-400 font-semibold'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              Carried {encumbrance.carried} / {encumbrance.capacity} lb
              {overCapacity ? ' — over capacity' : ''}
            </p>
          )}

          {/* Encumbrance tier + speed impact (VEG-406, computed since VEG-490) */}
          {hasInventory && encumbrance && encumbrance.tier !== 'unencumbered' && (
            <p
              data-testid="encumbrance-status"
              role="status"
              className={`mt-1 text-xs font-semibold ${
                encumbrance.tier === 'heavily-encumbered'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {encumbranceLabel} — speed {speedBeforeLoad} → {speedAfterLoad} ft
              {encumbrance.hasDisadvantage &&
                ', disadvantage on ability checks, attacks & STR/DEX/CON saves'}
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
                    // Free-typing breaks the catalog link (and its gear
                    // snapshot) from a prior pick.
                    setAddItemId(undefined);
                    setAddDetail(null);
                    setAddGear(undefined);
                    setAddGearHint(null);
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
              {addGearHint && (
                <p
                  data-testid="catalog-gear-hint"
                  className="text-xs text-amber-600 dark:text-amber-400"
                >
                  {addGearHint}
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
      {showAttunement && (
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
                  <span>{item.name}</span>
                  {editable && (
                    <button
                      type="button"
                      aria-label={`Remove attunement ${item.name}`}
                      onClick={() => removeAttuned(i)}
                      disabled={isSaving}
                      className="ml-1 text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                    >
                      &times;
                    </button>
                  )}
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

          {/* Attune-item form (owner only) */}
          {editable &&
            (attunementFull ? (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center">
                Attunement slots full (max {ATTUNEMENT_SLOTS}).
              </p>
            ) : (
              <div data-testid="add-attunement-form" className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label="New attunement name"
                    placeholder="Magic item name"
                    value={attuneName}
                    disabled={isSaving}
                    onChange={e => {
                      setAttuneName(e.target.value);
                      setAttuneItemId(undefined);
                    }}
                    className={`flex-1 min-w-[8rem] ${textInputClass}`}
                  />
                  <button
                    type="button"
                    onClick={addAttuned}
                    disabled={isSaving || attuneName.trim() === ''}
                    className="px-3 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    Attune item
                  </button>
                </div>
                <SrdItemSearch
                  onSelect={fillAttuneFromCatalog}
                  disabled={isSaving}
                  placeholder="Search the catalog to attune…"
                />
              </div>
            ))}
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
