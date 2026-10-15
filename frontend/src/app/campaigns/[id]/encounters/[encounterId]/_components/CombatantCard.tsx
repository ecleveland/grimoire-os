'use client';

import { useState, type Ref } from 'react';
import type { Combatant } from '@/lib/types';
import ConcentrationChip from '@/components/ConcentrationChip';
import ConditionChips from '@/components/ConditionChips';
import AddConditionSelect from '@/components/AddConditionSelect';
import { deathSaveStatus, showsDeathSaves, DEATH_SAVE_MAX } from '@/lib/death-saves';
import { parseAmount } from '../_hooks/encounter-rows';
import type { EncounterActions } from '../_hooks/useEncounterActions';
import LootDisplay from './LootDisplay';
import { smallButtonBase, lootButtonClass, statusSelectClass } from './tracker-styles';

export interface CombatantCardProps {
  combatant: Combatant;
  /** The card's row in the initiative-sorted list. */
  rowIndex: number;
  isCurrent: boolean;
  isController: boolean;
  writePending: boolean;
  round: number;
  turnBackDisabled: boolean;
  /** True when the neighbouring row shares this initiative, so a swap is a valid tiebreak. */
  canMoveUp: boolean;
  canMoveDown: boolean;
  cardRef?: Ref<HTMLDivElement>;
  actions: EncounterActions;
  onShowMonster: (monsterId: string) => void;
  onLinkRequest: () => void;
  onRemoveRequest: () => void;
  onRollLoot: (successMsg: string) => void;
}

/**
 * One initiative row. The card owns its in-progress edits, so a draft belongs
 * to the card it was typed in; the page keys cards so that a card follows its
 * combatant across a re-sort.
 */
export default function CombatantCard({
  combatant: c,
  rowIndex,
  isCurrent,
  isController,
  writePending,
  round,
  turnBackDisabled,
  canMoveUp,
  canMoveDown,
  cardRef,
  actions,
  onShowMonster,
  onLinkRequest,
  onRemoveRequest,
  onRollLoot,
}: CombatantCardProps) {
  // In-progress edits. null means no edit, so the field shows the stored
  // value. Each commit clears its draft before the write, so a rejected write
  // reverts the field; the amount clears once its action lands.
  const [hpDraft, setHpDraft] = useState<string | null>(null);
  const [amountDraft, setAmountDraft] = useState<string | null>(null);
  const [initDraft, setInitDraft] = useState<string | null>(null);
  const [concDraft, setConcDraft] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<string | null>(null);
  const isDead = c.hp <= 0;

  return (
    <div
      ref={cardRef}
      className={`p-4 rounded-lg border transition-colors ${
        isCurrent
          ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700'
          : isDead
            ? 'bg-red-50/50 dark:bg-red-900/10 border-gray-200 dark:border-gray-700'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
      }`}
    >
      {/* Inline turn header (VEG-384): the round, whose turn it is, and
                  the turn controls live on the active card itself, so they sit
                  beside that card's damage/status controls — no scrolling back
                  to a top bar. Controls stay controller-only. */}
      {isCurrent && (
        <div className="-mx-4 -mt-4 mb-3 flex items-center justify-between gap-3 rounded-t-lg border-b border-indigo-200 dark:border-indigo-800 bg-indigo-100/70 dark:bg-indigo-900/40 px-4 py-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-xs font-medium uppercase tracking-wide text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
              Round {round}
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {c.name}&apos;s turn
            </span>
          </div>
          {isController && (
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={actions.previousTurn}
                disabled={turnBackDisabled}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous Turn
              </button>
              <button
                onClick={actions.nextTurn}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Next Turn
              </button>
            </div>
          )}
        </div>
      )}
      {/* Dimming applies to the stats line only — the drop view below
                  must stay legible, since dead monsters are exactly the ones
                  whose loot the DM reads out. */}
      <div className={`flex items-center gap-4${isDead && !isCurrent ? ' opacity-60' : ''}`}>
        {isCurrent && (
          <span className="text-indigo-600 dark:text-indigo-400 text-lg font-bold">&raquo;</span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {c.monsterId ? (
              <button
                type="button"
                onClick={() => onShowMonster(c.monsterId!)}
                className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
              >
                {c.name}
              </button>
            ) : (
              <span className="font-medium text-gray-900 dark:text-white">{c.name}</span>
            )}
            {c.isNpc && (
              <span className="text-xs px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded">
                NPC
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">Init</div>
            {isController ? (
              <input
                type="text"
                inputMode="numeric"
                aria-label={`Initiative for ${c.name}`}
                value={initDraft ?? c.initiative}
                onChange={e => setInitDraft(e.target.value)}
                onBlur={() => {
                  if (initDraft === null) return;
                  setInitDraft(null);
                  actions.commitCombatantInitiative(c.name, rowIndex, initDraft);
                }}
                onKeyDown={e => {
                  // Enter commits via the blur handler — a single commit
                  // path, so it can't double-PATCH with a stale draft.
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                className="w-14 px-1 py-0.5 text-center font-mono font-medium border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            ) : (
              <div className="font-mono font-medium text-gray-900 dark:text-white">
                {c.initiative}
              </div>
            )}
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">AC</div>
            <div className="font-mono font-medium text-gray-900 dark:text-white">{c.ac}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-500 dark:text-gray-400">HP</div>
            {isController ? (
              <input
                type="number"
                aria-label={`HP for ${c.name}`}
                value={hpDraft ?? c.hp}
                onChange={e => setHpDraft(e.target.value)}
                onBlur={() => {
                  if (hpDraft === null) return;
                  setHpDraft(null);
                  actions.commitCombatantHp(c.name, rowIndex, hpDraft);
                }}
                onKeyDown={e => {
                  // Enter commits via the blur handler — a single commit
                  // path, so it can't double-PATCH with a stale draft.
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                className="w-16 px-1 py-0.5 text-center font-mono font-medium border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            ) : (
              <div className="font-mono font-medium text-gray-900 dark:text-white">
                {c.hp}/{c.maxHp}
              </div>
            )}
          </div>
          {isController && <div className="text-xs text-gray-400">/{c.maxHp}</div>}
          {(c.tempHp ?? 0) > 0 && (
            <div
              className="text-xs font-mono font-medium text-sky-600 dark:text-sky-400"
              title="Temporary HP"
            >
              +{c.tempHp} temp
            </div>
          )}
        </div>
      </div>
      {/* Status chips (VEG-287): conditions, concentration, and
                  exhaustion — shown to everyone. Controllers get a remove ×
                  on each condition; the add/toggle controls render below. */}
      {((c.conditions?.length ?? 0) > 0 || c.concentration || (c.exhaustion ?? 0) > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ConditionChips
            conditions={c.conditions ?? []}
            onRemove={
              isController ? cond => actions.toggleCondition(c.name, rowIndex, cond) : undefined
            }
            removeLabel={cond => `Remove ${cond} from ${c.name}`}
            disabled={writePending}
          />
          {c.concentration && <ConcentrationChip concentration={c.concentration} />}
          {(c.exhaustion ?? 0) > 0 && (
            <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
              Exhaustion {c.exhaustion}
            </span>
          )}
        </div>
      )}
      {/* Death saves (VEG-288): only for a downed PC. Pips + status are
                  shown to everyone; the mark/reset controls are controller-only
                  and lock once the tally resolves to stable or dead. */}
      {showsDeathSaves(c) &&
        (() => {
          const status = deathSaveStatus(c.deathSaves);
          const successes = c.deathSaves?.successes ?? 0;
          const failures = c.deathSaves?.failures ?? 0;
          const pips = (filled: number, tone: string) =>
            Array.from({ length: DEATH_SAVE_MAX }, (_, k) => (
              <span
                key={k}
                className={`inline-block w-2.5 h-2.5 rounded-full border ${
                  k < filled ? tone : 'border-gray-300 dark:border-gray-600'
                }`}
              />
            ));
          return (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Death Saves
              </span>
              <span
                className="inline-flex items-center gap-1"
                aria-label={`Death save successes for ${c.name}: ${successes} of ${DEATH_SAVE_MAX}`}
              >
                {pips(successes, 'bg-emerald-500 border-emerald-500')}
              </span>
              <span
                className="inline-flex items-center gap-1"
                aria-label={`Death save failures for ${c.name}: ${failures} of ${DEATH_SAVE_MAX}`}
              >
                {pips(failures, 'bg-red-500 border-red-500')}
              </span>
              {status === 'stable' && (
                <span className="text-xs px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded">
                  Stable
                </span>
              )}
              {status === 'dead' && (
                <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
                  Dead
                </span>
              )}
              {isController && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Mark death save success for ${c.name}`}
                    onClick={() => actions.markDeathSaveOnRow(c.name, rowIndex, 'success')}
                    disabled={writePending}
                    className={`${smallButtonBase} text-emerald-700 dark:text-emerald-400`}
                  >
                    + Success
                  </button>
                  <button
                    type="button"
                    aria-label={`Mark death save failure for ${c.name}`}
                    onClick={() => actions.markDeathSaveOnRow(c.name, rowIndex, 'failure')}
                    disabled={writePending}
                    className={`${smallButtonBase} text-red-700 dark:text-red-400`}
                  >
                    + Failure
                  </button>
                  {c.deathSaves && (
                    <button
                      type="button"
                      aria-label={`Reset death saves for ${c.name}`}
                      onClick={() => actions.resetDeathSaves(c.name, rowIndex)}
                      disabled={writePending}
                      className={lootButtonClass}
                    >
                      Reset
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      {/* Row management (left) + damage/heal/temp HP controls (right,
                  VEG-286). The raw HP input above stays as the advanced
                  affordance for direct corrections; these are the
                  table-friendly paths. */}
      {isController &&
        (() => {
          const rowAmount = amountDraft !== null ? parseAmount(amountDraft) : null;
          const actionsDisabled = writePending || rowAmount === null;
          return (
            <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                {/* Manual tiebreak (VEG-285): swap with the adjacent
                            row, offered only inside a tie group. */}
                {canMoveUp && (
                  <button
                    type="button"
                    aria-label={`Move ${c.name} up`}
                    onClick={() => actions.moveCombatant(c.name, rowIndex, 'up')}
                    disabled={writePending}
                    className={lootButtonClass}
                  >
                    &uarr;
                  </button>
                )}
                {canMoveDown && (
                  <button
                    type="button"
                    aria-label={`Move ${c.name} down`}
                    onClick={() => actions.moveCombatant(c.name, rowIndex, 'down')}
                    disabled={writePending}
                    className={lootButtonClass}
                  >
                    &darr;
                  </button>
                )}
                {/* Link / unlink the stat-block reference (VEG-328). */}
                {!c.monsterId && (
                  <button
                    type="button"
                    aria-label={`Link monster for ${c.name}`}
                    onClick={onLinkRequest}
                    disabled={writePending}
                    className={lootButtonClass}
                  >
                    Link monster
                  </button>
                )}
                {c.monsterId && (
                  <button
                    type="button"
                    aria-label={`Unlink monster from ${c.name}`}
                    onClick={() => actions.unlinkCombatant(c.name, rowIndex)}
                    disabled={writePending}
                    className={lootButtonClass}
                  >
                    Unlink
                  </button>
                )}
                {c.monsterId && !c.loot && (
                  <button
                    type="button"
                    aria-label={`Roll loot for ${c.name}`}
                    onClick={() => onRollLoot(`Rolled loot for ${c.name}`)}
                    disabled={writePending}
                    className={lootButtonClass}
                  >
                    Roll loot
                  </button>
                )}
                {/* Remove the row (VEG-284) — confirmed via dialog below. */}
                <button
                  type="button"
                  aria-label={`Remove ${c.name}`}
                  onClick={onRemoveRequest}
                  disabled={writePending}
                  className={`${smallButtonBase} text-red-700 dark:text-red-400`}
                >
                  Remove
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Amount"
                  aria-label={`Damage or heal amount for ${c.name}`}
                  value={amountDraft ?? ''}
                  onChange={e => setAmountDraft(e.target.value)}
                  className="w-20 px-2 py-1 text-xs text-center font-mono border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  type="button"
                  aria-label={`Damage ${c.name}`}
                  onClick={async () => {
                    if (amountDraft === null) return;
                    if (await actions.applyHpAction('damage', c.name, rowIndex, amountDraft))
                      setAmountDraft(null);
                  }}
                  disabled={actionsDisabled}
                  className={`${smallButtonBase} text-red-700 dark:text-red-400`}
                >
                  Damage
                </button>
                <button
                  type="button"
                  aria-label={`Heal ${c.name}`}
                  onClick={async () => {
                    if (amountDraft === null) return;
                    if (await actions.applyHpAction('heal', c.name, rowIndex, amountDraft))
                      setAmountDraft(null);
                  }}
                  disabled={actionsDisabled}
                  className={`${smallButtonBase} text-emerald-700 dark:text-emerald-400`}
                >
                  Heal
                </button>
                <button
                  type="button"
                  aria-label={`Grant temp HP to ${c.name}`}
                  onClick={async () => {
                    if (amountDraft === null) return;
                    if (await actions.applyHpAction('temp', c.name, rowIndex, amountDraft))
                      setAmountDraft(null);
                  }}
                  disabled={actionsDisabled}
                  className={`${smallButtonBase} text-sky-700 dark:text-sky-400`}
                >
                  Temp HP
                </button>
              </div>
            </div>
          );
        })()}
      {/* Status editing (VEG-287): add a condition, toggle/name a
                  concentration spell, set exhaustion. Controller-only; the
                  read-only chips above are shown to everyone. */}
      {isController && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <AddConditionSelect
            activeConditions={c.conditions ?? []}
            onAdd={cond => actions.toggleCondition(c.name, rowIndex, cond)}
            ariaLabel={`Add condition to ${c.name}`}
            disabled={writePending}
            className={statusSelectClass}
          />
          <button
            type="button"
            aria-label={`Toggle concentration for ${c.name}`}
            onClick={async () => {
              await actions.toggleConcentration(c.name, rowIndex);
              setConcDraft(null);
            }}
            disabled={writePending}
            className={lootButtonClass}
          >
            {c.concentration ? 'Stop concentrating' : 'Concentrate'}
          </button>
          {c.concentration && (
            <input
              type="text"
              placeholder="Spell"
              aria-label={`Concentration spell for ${c.name}`}
              value={concDraft ?? c.concentration.spell ?? ''}
              onChange={e => setConcDraft(e.target.value)}
              onBlur={() => {
                if (concDraft === null) return;
                setConcDraft(null);
                actions.commitConcentrationSpell(c.name, rowIndex, concDraft);
              }}
              onKeyDown={e => {
                // Enter commits via the blur handler — one commit path.
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
              className="w-28 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          )}
          <select
            aria-label={`Exhaustion for ${c.name}`}
            value={c.exhaustion ?? 0}
            onChange={e => actions.setExhaustion(c.name, rowIndex, Number(e.target.value))}
            disabled={writePending}
            className={statusSelectClass}
          >
            <option value={0}>Exhaustion: none</option>
            {[1, 2, 3, 4, 5, 6].map(n => (
              <option key={n} value={n}>
                Exhaustion {n}
              </option>
            ))}
          </select>
          {/* Quick-edit notes (VEG-289), committed on blur/Enter; empty
                      clears them. Read-only view for non-controllers renders below. */}
          <input
            type="text"
            placeholder="Notes"
            aria-label={`Notes for ${c.name}`}
            value={notesDraft ?? c.notes ?? ''}
            onChange={e => setNotesDraft(e.target.value)}
            onBlur={() => {
              if (notesDraft === null) return;
              setNotesDraft(null);
              actions.commitCombatantNotes(c.name, rowIndex, notesDraft);
            }}
            onKeyDown={e => {
              // Enter commits via the blur handler — one commit path.
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            className="min-w-0 flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      )}
      {/* Notes are shown to everyone (view); only controllers get the
                  edit field above (VEG-289). */}
      {!isController && c.notes && (
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">Notes:</span> {c.notes}
        </div>
      )}
      {/* DM-only drop view (VEG-301) — the player reveal is a separate ticket. */}
      {isController && c.loot && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-start justify-between gap-2 text-sm">
          <LootDisplay coinage={c.loot.coinage} items={c.loot.items} />
          {/* Rerolling needs the monster reference; an unlinked row
                      (VEG-328) keeps its drop readable but can't reroll. */}
          {c.monsterId && (
            <button
              type="button"
              aria-label={`Reroll loot for ${c.name}`}
              onClick={() => onRollLoot(`Re-rolled loot for ${c.name}`)}
              disabled={writePending}
              className={lootButtonClass}
            >
              Reroll
            </button>
          )}
        </div>
      )}
    </div>
  );
}
