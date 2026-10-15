'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useMediaQuery } from '@/lib/use-media-query';
import { useValueChange } from '@/lib/use-value-change';
import Badge from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import DropdownMenu from '@/components/DropdownMenu';
import EncounterDifficulty from '@/components/EncounterDifficulty';
import LinkMonsterDialog from '@/components/LinkMonsterDialog';
import LoadingState from '@/components/LoadingState';
import Modal from '@/components/Modal';
import MonsterLookupPanel from '@/components/MonsterLookupPanel';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import { sortByInitiative } from './_hooks/encounter-rows';
import { useEncounter } from './_hooks/useEncounter';
import { useEncounterActions } from './_hooks/useEncounterActions';
import { useMonsterViewer } from './_hooks/useMonsterViewer';
import AddCombatantControls from './_components/AddCombatantControls';
import CombatantCard from './_components/CombatantCard';
import EncounterLootPanel from './_components/EncounterLootPanel';
import MonsterSidePanel from './_components/MonsterSidePanel';

export default function InitiativeTrackerPage() {
  const { id: campaignId, encounterId } = useParams<{ id: string; encounterId: string }>();
  const { user, isDm } = useAuth();
  const { encounter, isLoading, writePending, patch, rollLoot } = useEncounter(encounterId);
  // Auto-roll loot when a monster combatant drops to 0 HP (VEG-301).
  // Session-local DM preference, intentionally not persisted on the encounter.
  const [autoRollLoot, setAutoRollLoot] = useState(false);
  // Link-monster picker (VEG-328): which unlinked row is being linked. Keyed
  // by name and sorted-row index, the identity resolveCombatantRow reads.
  const [linkTarget, setLinkTarget] = useState<{ name: string; index: number } | null>(null);
  // Remove-combatant confirm (VEG-284): which row is pending removal. Same
  // name and sorted-row-index identity as the link picker.
  const [removeTarget, setRemoveTarget] = useState<{ name: string; index: number } | null>(null);
  // Clear-all confirm (VEG-284).
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // Live-combat side panel (VEG-384). On wide screens the active creature's
  // stat block floats in a sticky right-hand column so the DM never scrolls to
  // read it. `pinnedMonsterId` is a click-override: clicking a combatant's name
  // pins its stat block until the turn advances, otherwise the panel follows
  // whoever is up.
  const isWide = useMediaQuery('(min-width: 1024px)');
  const [pinnedMonsterId, setPinnedMonsterId] = useState<string | null>(null);
  // The two-column row and the active card, used to (a) anchor the stat panel
  // level with the active card and (b) scroll that card into view as the turn
  // advances, so the turn controls and damage/status controls — now inline on
  // the active card — never sit off-screen (VEG-384).
  const containerRef = useRef<HTMLDivElement>(null);
  const activeCardRef = useRef<HTMLDivElement>(null);
  // Distinguishes a genuine turn change from the initial load, so the page
  // doesn't yank-scroll on first render.
  const prevTurnRef = useRef<number | null>(null);

  // The monster whose turn it is (if any) drives the side panel by default.
  const activeMonsterId = encounter
    ? (sortByInitiative(encounter.combatants)[encounter.currentTurn]?.monsterId ?? null)
    : null;
  // What the panel shows: an explicit pin wins, else the active combatant; only
  // on wide screens (the panel is hidden below `lg`, so don't fetch for it).
  const panelMonsterId = isWide ? (pinnedMonsterId ?? activeMonsterId) : null;

  // Advancing/stepping the turn drops any manual pin so the panel resumes
  // following whoever is now up.
  const currentTurn = encounter?.currentTurn;
  useValueChange(currentTurn, () => setPinnedMonsterId(null));

  // Scroll the active card into view when the turn advances (not on first
  // load). Brings the card — and its now-inline turn/damage/status controls —
  // to the DM instead of making them scroll to it. Guarded for jsdom, which
  // has no scrollIntoView.
  useEffect(() => {
    if (currentTurn === undefined) return;
    const prev = prevTurnRef.current;
    prevTurnRef.current = currentTurn;
    if (prev === null || prev === currentTurn) return;
    const card = activeCardRef.current;
    if (card && typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentTurn]);

  const viewer = useMonsterViewer();
  const actions = useEncounterActions(encounter, { patch, rollLoot, writePending }, autoRollLoot);

  // A name click pins the stat block into the always-visible side panel on wide
  // screens; below `lg` that panel is hidden, so fall back to the modal viewer.
  const showCombatantMonster = (monsterId: string) =>
    isWide ? setPinnedMonsterId(monsterId) : viewer.open(monsterId);

  if (isLoading) return <LoadingState />;
  if (!encounter)
    return <div className="text-gray-500 dark:text-gray-400">Encounter not found.</div>;

  const sorted = sortByInitiative(encounter.combatants);
  // The active row, clamped so a stale/out-of-range currentTurn still resolves
  // to a real card — that card hosts the inline turn controls, which must stay
  // reachable for the DM to step a corrupted marker back into range (-1 only
  // when there are no combatants at all).
  const activeRowIndex =
    sorted.length === 0 ? -1 : Math.min(Math.max(encounter.currentTurn, 0), sorted.length - 1);
  const activeCombatant = sorted[activeRowIndex] ?? null;
  // A "peek": the panel is pinned to a monster other than the active
  // combatant's, i.e. a quick reference (resistances/immunities) that leaves
  // whose-turn-it-is untouched. The banner makes that explicit and reversible.
  const isPeeking = isWide && pinnedMonsterId !== null && pinnedMonsterId !== activeMonsterId;
  const isController = isDm || (user && encounter.createdBy === user.userId);
  // Card identity follows resolveCombatantRow's rule: a unique name keys by
  // name, so the card and its open draft follow the combatant across a
  // re-sort; a duplicated name keys by row. A name that flips between unique
  // and duplicated remounts its card and drops an open draft.
  const nameCount = new Map<string, number>();
  for (const c of sorted) nameCount.set(c.name, (nameCount.get(c.name) ?? 0) + 1);

  return (
    <div
      ref={containerRef}
      className="lg:grid lg:grid-cols-[minmax(0,1fr)_38rem] lg:gap-6 lg:items-start"
    >
      <div className="min-w-0 max-w-3xl mx-auto lg:mx-0 lg:max-w-none">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{encounter.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant={encounter.isActive ? 'success' : 'neutral'} size="md">
                {encounter.isActive ? 'Active' : 'Inactive'}
              </Badge>
              {/* The round normally rides on the active card's inline header; with
                  no combatants there is no such card, so surface it here so the
                  round is never hidden (and never duplicated — these are mutually
                  exclusive). */}
              {!activeCombatant && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  Round {encounter.round}
                </span>
              )}
            </div>
          </div>
          {isController && (
            <div className="flex gap-2">
              <button
                onClick={actions.toggleActive}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
              >
                {encounter.isActive ? 'End Combat' : 'Start Combat'}
              </button>
            </div>
          )}
        </div>

        {/* Encounter difficulty (VEG-362): DM-planning info, controller-only like
          the loot panel. Monsters drive XP/CR; the PCs in the encounter set the
          2024 budget. */}
        {isController && (
          <div className="mb-4">
            <EncounterDifficulty combatants={encounter.combatants} />
          </div>
        )}

        <div className="space-y-2">
          {sorted.map((c, i) => {
            const isCurrent = i === activeRowIndex;
            // The roll endpoint addresses combatants by their position in the
            // stored array, not the sorted row. `sorted` shares object
            // references with `encounter.combatants`, so identity lookup maps
            // row → array index even with duplicate names.
            const arrayIndex = encounter.combatants.indexOf(c);
            return (
              <CombatantCard
                key={nameCount.get(c.name) === 1 ? c.name : `${c.name}#${i}`}
                combatant={c}
                rowIndex={i}
                isCurrent={isCurrent}
                isController={!!isController}
                writePending={writePending}
                round={encounter.round}
                turnBackDisabled={encounter.round === 1 && encounter.currentTurn === 0}
                canMoveUp={i > 0 && sorted[i - 1].initiative === c.initiative}
                canMoveDown={i < sorted.length - 1 && sorted[i + 1].initiative === c.initiative}
                cardRef={isCurrent ? activeCardRef : undefined}
                actions={actions}
                onShowMonster={showCombatantMonster}
                onLinkRequest={() => setLinkTarget({ name: c.name, index: i })}
                onRemoveRequest={() => setRemoveTarget({ name: c.name, index: i })}
                onRollLoot={successMsg => rollLoot(encounter, arrayIndex, successMsg)}
              />
            );
          })}
        </div>

        {isController && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <AddCombatantControls
              campaignId={campaignId}
              existingNames={encounter.combatants.map(c => c.name)}
              writePending={writePending}
              onAddManual={actions.addManualCombatant}
              onAddParty={actions.addPartyToEncounter}
            />
            {/* Roll initiative for every NPC at once (VEG-370), as a single menu:
              "Each" rolls per-NPC d20 + DEX mod; "One shared roll" gives the
              whole group one d20. */}
            {encounter.combatants.some(c => c.isNpc) && (
              <DropdownMenu
                testId="roll-initiative-menu"
                label={
                  <>
                    <span aria-hidden="true">🎲</span> Roll initiative
                  </>
                }
                disabled={writePending}
                buttonClassName="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                items={[
                  {
                    label: 'Each NPC separately',
                    description: "d20 + each NPC's DEX modifier",
                    onSelect: () => actions.rollNpcInitiatives('each'),
                  },
                  {
                    label: 'One shared roll',
                    description: 'one d20 for the whole group',
                    onSelect: () => actions.rollNpcInitiatives('shared'),
                  },
                ]}
              />
            )}
            {encounter.combatants.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                disabled={writePending}
                className="ml-auto px-3 py-1.5 text-sm border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-700 dark:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        )}

        {isController && (
          <EncounterLootPanel
            encounter={encounter}
            writePending={writePending}
            autoRollLoot={autoRollLoot}
            onAutoRollLootChange={setAutoRollLoot}
            onRollAll={() => rollLoot(encounter, undefined, 'Rolled loot for the encounter')}
          />
        )}

        <ConfirmDialog
          open={removeTarget !== null}
          onOpenChange={open => {
            if (!open) setRemoveTarget(null);
          }}
          title="Remove combatant?"
          description={`Remove ${removeTarget?.name ?? ''} from the encounter? Their HP and any rolled loot are discarded.`}
          confirmLabel="Remove"
          onConfirm={() => {
            if (removeTarget) actions.removeCombatant(removeTarget.name, removeTarget.index);
          }}
        />

        <ConfirmDialog
          open={confirmClearAll}
          onOpenChange={setConfirmClearAll}
          title="Clear all combatants?"
          description="This removes every combatant from the tracker and resets it to round 1."
          confirmLabel="Clear all"
          onConfirm={actions.clearAllCombatants}
        />

        <Modal open={linkTarget !== null} onClose={() => setLinkTarget(null)} label="Link monster">
          {linkTarget && (
            <LinkMonsterDialog
              combatantName={linkTarget.name}
              onSelect={async monster => {
                const outcome = await actions.linkMonsterToCombatant(linkTarget, monster);
                if (outcome !== 'failed') setLinkTarget(null);
              }}
              onCancel={() => setLinkTarget(null)}
              submitting={writePending}
            />
          )}
        </Modal>

        <MonsterLookupPanel canAdd={!!isController} onAdd={actions.addMonsterToEncounter} />

        <Modal
          open={viewer.isOpen}
          onClose={viewer.close}
          label={viewer.monster?.name ?? 'Monster'}
        >
          {viewer.isLoading || !viewer.monster ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Loading monster…
            </p>
          ) : (
            <MonsterStatBlock monster={viewer.monster} />
          )}
        </Modal>
      </div>

      <MonsterSidePanel
        monsterId={panelMonsterId}
        isWide={isWide}
        isPeeking={isPeeking}
        activeCombatant={activeCombatant}
        currentTurn={encounter.currentTurn}
        containerRef={containerRef}
        activeCardRef={activeCardRef}
        onBackToTurn={() => setPinnedMonsterId(null)}
      />
    </div>
  );
}
