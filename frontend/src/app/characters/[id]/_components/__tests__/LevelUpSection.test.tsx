import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LevelUpSection from '../LevelUpSection';
import type { Character, SrdClass } from '@/lib/types';
import { makeCharacter } from '@/test-utils/character';

// The dialog fetches /srd/classes for the hit die and per-level features
// (shared, cached with SpellcastingSection). Mock just useApiQuery, leaving the
// rest of the query layer intact. Default to "no data" so section-level tests
// don't depend on the catalog; dialog tests opt in per case.
const mockUseApiQuery = vi.fn();
vi.mock('@/lib/query', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/query')>()),
  useApiQuery: (path: string) => mockUseApiQuery(path),
}));

// Deterministic HP rolls: the dialog rolls via lib/dice's rollDie.
const mockRollDie = vi.fn();
vi.mock('@/lib/dice', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/dice')>()),
  rollDie: (sides: number) => mockRollDie(sides),
}));

const fighterClass: SrdClass = {
  id: 'cls-fighter',
  name: 'Fighter',
  contentSource: 'srd',
  hitDie: 'd10',
  primaryAbilities: ['Strength'],
  savingThrows: ['Strength', 'Constitution'],
  armorProficiencies: [],
  weaponProficiencies: [],
  skillChoices: [],
  toolProficiencies: [],
  numSkillChoices: 2,
  features: [
    { name: 'Second Wind', level: 1, description: 'Regain hit points.' },
    { name: 'Extra Attack', level: 6, description: 'Attack twice.' },
    { name: 'Another Level-6 Boon', level: 6 },
    { name: 'Indomitable', level: 9 },
  ],
  source: 'SRD 5.2.1',
};

// VEG-454. A class carrying one feature name at two levels — legal since
// VEG-507 widened the unique key to [classId, name, level], and the shape every
// real class has for Ability Score Improvement. Kept separate from
// `fighterClass` so the level-6 assertions above don't have to absorb it.
const fighterWithRecurringAsi: SrdClass = {
  ...fighterClass,
  features: [
    { name: 'Ability Score Improvement', level: 4, description: 'Raise an ability score.' },
    { name: 'Ability Score Improvement', level: 6, description: 'Raise an ability score.' },
  ],
};

const onPatch = vi.fn();
const editable = { editable: true as const, onPatch, isSaving: false };

// makeCharacter defaults: level-5 Fighter, 6,500 XP (band floor), HP 44/32/+5,
// hit dice d10 8 total 3 spent, no spellcastingAbility.
function renderSection(over: Partial<Character> = {}, props = editable) {
  return render(<LevelUpSection character={makeCharacter(over)} {...props} />);
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /level up/i }));
  return screen.getByRole('dialog');
}

beforeEach(() => {
  onPatch.mockReset();
  mockRollDie.mockReset();
  mockUseApiQuery.mockReset();
  mockUseApiQuery.mockReturnValue({ data: undefined });
});

describe('LevelUpSection', () => {
  describe('XP progress display', () => {
    it('shows current XP and the next-level target', () => {
      renderSection();
      expect(screen.getByText('6,500 XP')).toBeInTheDocument();
      expect(screen.getByText(/7,500 XP to level 6/)).toBeInTheDocument();
    });

    it('renders the progress bar at the position within the band', () => {
      // 10,250 XP at level 5: 3,750 into a 7,500 band = 50%.
      renderSection({ experiencePoints: 10250 });
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    });

    it('clamps the bar at 100% when XP overshoots the next threshold', () => {
      renderSection({ experiencePoints: 99999 });
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    });

    it('announces readiness once the threshold is met', () => {
      renderSection({ experiencePoints: 14000 });
      expect(screen.getByText(/ready to level up/i)).toBeInTheDocument();
    });

    it('shows max level instead of a target at level 20', () => {
      renderSection({ level: 20, experiencePoints: 355000 });
      expect(screen.getByText(/max level/i)).toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('is fully read-only for a non-owner: no award field, no level-up button', () => {
      renderSection({}, { editable: false as const });
      expect(screen.getByText('6,500 XP')).toBeInTheDocument();
      expect(screen.queryByLabelText(/xp to award/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /level up/i })).not.toBeInTheDocument();
    });
  });

  describe('awarding XP', () => {
    it('adds the awarded amount to the stored XP in one patch and clears the field', async () => {
      const user = userEvent.setup();
      renderSection();
      fireEvent.change(screen.getByLabelText(/xp to award/i), { target: { value: '250' } });
      await user.click(screen.getByRole('button', { name: /award xp/i }));
      expect(onPatch).toHaveBeenCalledWith({ experiencePoints: 6750 });
      expect(screen.getByLabelText(/xp to award/i)).toHaveValue(null);
    });

    it('does not patch for an empty or non-positive amount', async () => {
      const user = userEvent.setup();
      renderSection();
      await user.click(screen.getByRole('button', { name: /award xp/i }));
      fireEvent.change(screen.getByLabelText(/xp to award/i), { target: { value: '0' } });
      await user.click(screen.getByRole('button', { name: /award xp/i }));
      expect(onPatch).not.toHaveBeenCalled();
    });

    it('disables the award button while a write is saving', () => {
      renderSection({}, { ...editable, isSaving: true });
      expect(screen.getByRole('button', { name: /award xp/i })).toBeDisabled();
    });

    it('blocks an award that would overflow the stored XP integer', async () => {
      const user = userEvent.setup();
      renderSection();
      // 6,500 + 2,147,483,647 exceeds the Postgres int4 maximum.
      fireEvent.change(screen.getByLabelText(/xp to award/i), {
        target: { value: '2147483647' },
      });
      const awardButton = screen.getByRole('button', { name: /award xp/i });
      expect(awardButton).toBeDisabled();
      await user.click(awardButton);
      expect(onPatch).not.toHaveBeenCalled();
    });
  });

  describe('level-up dialog', () => {
    it('opens showing the level transition', async () => {
      const user = userEvent.setup();
      renderSection();
      const dialog = await openDialog(user);
      expect(within(dialog).getByText(/level 5 → 6/i)).toBeInTheDocument();
    });

    it('hides the level-up button at level 20', () => {
      renderSection({ level: 20, experiencePoints: 355000 });
      expect(screen.queryByRole('button', { name: /level up/i })).not.toBeInTheDocument();
    });

    it('notes when leveling below the XP threshold (milestone play)', async () => {
      const user = userEvent.setup();
      renderSection(); // 6,500 XP < 14,000 threshold
      const dialog = await openDialog(user);
      expect(within(dialog).getByText(/below the xp threshold/i)).toBeInTheDocument();
    });

    it('does not show the below-threshold note when XP is sufficient', async () => {
      const user = userEvent.setup();
      renderSection({ experiencePoints: 14000 });
      const dialog = await openDialog(user);
      expect(within(dialog).queryByText(/below the xp threshold/i)).not.toBeInTheDocument();
    });

    it('surfaces a proficiency bonus increase when the new level crosses a step', async () => {
      const user = userEvent.setup();
      // Level 8 → 9 crosses +3 → +4.
      renderSection({ level: 8, experiencePoints: 34000 });
      const dialog = await openDialog(user);
      expect(within(dialog).getByText(/\+3 → \+4/)).toBeInTheDocument();
    });

    it('confirms with the average HP gain by default in a single composite patch', async () => {
      const user = userEvent.setup();
      renderSection();
      const dialog = await openDialog(user);
      // d10 average 6 + CON mod 2 = 8: 44/32 → 52/40, hit dice 8 → 9 total.
      expect(within(dialog).getByText(/\+8 HP/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: /confirm level up/i }));
      expect(onPatch).toHaveBeenCalledWith({
        level: 6,
        hitPoints: { max: 52, current: 40, temporary: 5 },
        hitDice: { dieType: 'd10', total: 9, spent: 3 },
      });
    });

    it('stays open after confirming until the leveled character flows back down', async () => {
      // A failed write (409 conflict, network error) leaves the character
      // unchanged — the dialog must keep its state (roll, feature choices) so
      // the player can retry instead of redoing everything.
      const user = userEvent.setup();
      const { rerender } = render(<LevelUpSection character={makeCharacter()} {...editable} />);
      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: /confirm level up/i }));
      expect(onPatch).toHaveBeenCalledTimes(1);
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // The successful write refetches and the bumped character re-renders.
      rerender(
        <LevelUpSection
          character={makeCharacter({ level: 6, experiencePoints: 6500 })}
          {...editable}
        />
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('uses a rolled result instead when the player rolls', async () => {
      mockRollDie.mockReturnValue(3);
      const user = userEvent.setup();
      renderSection();
      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('radio', { name: /roll/i }));
      await user.click(within(dialog).getByRole('button', { name: /roll d10/i }));
      expect(mockRollDie).toHaveBeenCalledWith(10);
      // 3 + 2 CON = 5.
      expect(within(dialog).getByText(/\+5 HP/)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: /confirm level up/i }));
      expect(onPatch).toHaveBeenCalledWith({
        level: 6,
        hitPoints: { max: 49, current: 37, temporary: 5 },
        hitDice: { dieType: 'd10', total: 9, spent: 3 },
      });
    });

    it('clamps a disastrous roll to the 1 HP minimum', async () => {
      mockRollDie.mockReturnValue(1);
      const user = userEvent.setup();
      renderSection({
        abilityScores: {
          strength: 16,
          dexterity: 12,
          constitution: 4, // CON mod -3
          intelligence: 10,
          wisdom: 13,
          charisma: 8,
        },
      });
      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('radio', { name: /roll/i }));
      await user.click(within(dialog).getByRole('button', { name: /roll d10/i }));
      expect(within(dialog).getByText(/\+1 HP/)).toBeInTheDocument();
    });

    it('cannot confirm in roll mode before rolling', async () => {
      const user = userEvent.setup();
      renderSection();
      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('radio', { name: /roll/i }));
      expect(within(dialog).getByRole('button', { name: /confirm level up/i })).toBeDisabled();
    });

    it('skips the HP change entirely for a character without a stored HP block', async () => {
      const user = userEvent.setup();
      renderSection({ hitPoints: null });
      const dialog = await openDialog(user);
      expect(within(dialog).getByText(/no hit points recorded/i)).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: /confirm level up/i }));
      expect(onPatch).toHaveBeenCalledWith({
        level: 6,
        hitDice: { dieType: 'd10', total: 9, spent: 3 },
      });
    });

    it('seeds the hit-dice pool from the class hit die when the character has none', async () => {
      mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
      const user = userEvent.setup();
      renderSection({ hitDice: null });
      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: /confirm level up/i }));
      expect(onPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 6,
          hitDice: { dieType: 'd10', total: 6, spent: 0 },
        })
      );
    });

    it('offers the new class features pre-checked and appends them on confirm', async () => {
      mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
      const user = userEvent.setup();
      renderSection({ features: [{ name: 'Second Wind', source: 'Fighter' }] });
      const dialog = await openDialog(user);
      expect(within(dialog).getByRole('checkbox', { name: /extra attack/i })).toBeChecked();
      expect(within(dialog).getByRole('checkbox', { name: /another level-6 boon/i })).toBeChecked();
      // Level-9 feature is not offered at level 6.
      expect(within(dialog).queryByText('Indomitable')).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: /confirm level up/i }));
      expect(onPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          features: [
            { name: 'Second Wind', source: 'Fighter' },
            { name: 'Extra Attack', source: 'Fighter', level: 6, description: 'Attack twice.' },
            { name: 'Another Level-6 Boon', source: 'Fighter', level: 6 },
          ],
        })
      );
    });

    it('leaves an unchecked feature out of the patch', async () => {
      mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
      const user = userEvent.setup();
      renderSection();
      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('checkbox', { name: /another level-6 boon/i }));
      await user.click(within(dialog).getByRole('button', { name: /confirm level up/i }));
      const patch = onPatch.mock.calls[0][0];
      expect(patch.features).toEqual([
        { name: 'Extra Attack', source: 'Fighter', level: 6, description: 'Attack twice.' },
      ]);
    });

    it('warns for an unknown or homebrew class instead of silently dropping suggestions', async () => {
      mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
      const user = userEvent.setup();
      renderSection({ class: 'Pumpkin Sage' });
      const dialog = await openDialog(user);
      expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();
      // The catalog resolved but has no such class — same advisory as a failed
      // load, so the player knows suggestions were unavailable, not absent.
      expect(within(dialog).getByText(/class data.*unavailable/i)).toBeInTheDocument();
      // HP average falls back to the character's own stored hit die (d10 → +8).
      expect(within(dialog).getByText(/\+8 HP/)).toBeInTheDocument();
    });

    it('shows no class-data advisory when the class resolves normally', async () => {
      mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
      const user = userEvent.setup();
      renderSection();
      const dialog = await openDialog(user);
      expect(within(dialog).queryByText(/class data.*unavailable/i)).not.toBeInTheDocument();
    });

    // VEG-528. Two independently-reachable states have to coincide: a sheet with
    // hitPoints but no hitDice (API-created, or predating the builder) whose
    // class doesn't resolve. The die then came from a hardcoded `d8` with no
    // mention of it anywhere in the dialog, and confirming wrote the resulting
    // gain into `hitPoints.max` permanently — 4 + CON where a Barbarian owes 6.
    //
    // VEG-524 made that state far easier to reach: an ambiguous class name now
    // resolves to nothing, so any character sharing a name with its owner's
    // homebrew class lands here.
    describe('picking a hit die when nothing supplies one (VEG-528)', () => {
      // makeCharacter is CON 14 (+2). d8 → 5 + 2 = +7, d12 → 7 + 2 = +9.
      const unresolvable = { hitDice: null, class: 'Pumpkin Sage' };

      it('offers a die selector instead of silently assuming d8', async () => {
        mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
        const user = userEvent.setup();
        renderSection(unresolvable);
        const dialog = await openDialog(user);
        expect(within(dialog).getByRole('combobox', { name: /hit die/i })).toBeInTheDocument();
      });

      // The read side of the same rule. Every guard VEG-530 added sits on a
      // write path, so a pool carrying d100 — legal through `HitDiceDto`, which
      // still validates against DIE_TYPES — skipped the picker entirely and
      // computed `averageHpForDie('d100')` = 51 into a permanent HP maximum,
      // once per level. A d4-d12 pool a DM granted still wins, as before; only a
      // die that is not a hit die falls through to the question.
      it('asks for a die when the stored pool carries one that is not a hit die', async () => {
        mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
        const user = userEvent.setup();
        renderSection({ hitDice: { dieType: 'd100', total: 5, spent: 0 }, class: 'Pumpkin Sage' });
        const dialog = await openDialog(user);

        expect(within(dialog).getByRole('combobox', { name: /hit die/i })).toBeInTheDocument();
        // d8 average 5, +2 CON = +7. Trusting the d100 would read +53.
        expect(within(dialog).getByTestId('hp-gain-preview')).toHaveTextContent('+7 HP');
      });

      // The counterpart: a nonstandard but real hit die is the player's record
      // and still outranks everything, so the picker stays away.
      it('still trusts a stored d12 without asking', async () => {
        mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
        const user = userEvent.setup();
        renderSection({ hitDice: { dieType: 'd12', total: 5, spent: 0 }, class: 'Pumpkin Sage' });
        const dialog = await openDialog(user);

        expect(within(dialog).queryByRole('combobox', { name: /hit die/i })).toBeNull();
        // d12 average 7, +2 CON = +9.
        expect(within(dialog).getByTestId('hp-gain-preview')).toHaveTextContent('+9 HP');
      });

      // VEG-530 narrowed the class-die read to real hit dice. A class that
      // declares d100 used to satisfy `classHitDie`, so the picker never
      // appeared and confirming wrote roughly +51 into a permanent maximum
      // beside a d100 pool the dialog offers no way back from. The class still
      // resolves — its feature suggestions are fine — only the die is declined.
      it('asks for a die when the class declares one that is not a hit die', async () => {
        mockUseApiQuery.mockReturnValue({ data: [{ ...fighterClass, hitDie: 'd100' }] });
        const user = userEvent.setup();
        renderSection({ hitDice: null, class: fighterClass.name });
        const dialog = await openDialog(user);

        expect(within(dialog).getByRole('combobox', { name: /hit die/i })).toBeInTheDocument();
        // The picker's own default, not the class's d100.
        expect(within(dialog).getByText(/computed from d8/i)).toBeInTheDocument();
        expect(within(dialog).queryByText(/d100/)).toBeNull();
      });

      // The old copy only said feature suggestions were missing. It said nothing
      // about the die or the number about to be written.
      it('names the die in play and warns the HP maximum is permanent', async () => {
        mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
        const user = userEvent.setup();
        renderSection(unresolvable);
        const dialog = await openDialog(user);
        expect(within(dialog).getByText(/computed from d8/i)).toBeInTheDocument();
        expect(within(dialog).getByText(/permanent maximum/i)).toBeInTheDocument();
      });

      it('recomputes the HP preview from the picked die', async () => {
        mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
        const user = userEvent.setup();
        renderSection(unresolvable);
        const dialog = await openDialog(user);

        expect(within(dialog).getByTestId('hp-gain-preview')).toHaveTextContent('+7 HP');
        await user.selectOptions(within(dialog).getByRole('combobox', { name: /hit die/i }), 'd12');
        expect(within(dialog).getByTestId('hp-gain-preview')).toHaveTextContent('+9 HP');
      });

      // The point of the whole change: the picked die reaches the write, both as
      // the HP gain and as the die the new hit-dice pool is seeded with. Those
      // two disagreeing is how the sheet would end up self-contradictory.
      it('writes the picked die into both the HP maximum and the seeded pool', async () => {
        mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
        const user = userEvent.setup();
        renderSection(unresolvable);
        const dialog = await openDialog(user);

        await user.selectOptions(within(dialog).getByRole('combobox', { name: /hit die/i }), 'd12');
        await user.click(within(dialog).getByRole('button', { name: /confirm level up/i }));

        expect(onPatch).toHaveBeenCalledWith(
          expect.objectContaining({
            level: 6,
            // 44 + 9, and the pool seeded with the same die.
            hitPoints: { max: 53, current: 41, temporary: 5 },
            hitDice: { dieType: 'd12', total: 6, spent: 0 },
          })
        );
      });

      // DIE_TYPES is the general die vocabulary and carries d20 and d100 for
      // rolls. Neither is a 5e hit die, and this selector feeds a permanent
      // hitPoints.max — a mis-clicked d100 writes +51 and seeds a d100 pool the
      // dialog offers no way back from.
      it('offers only real hit dice, not the d20 and d100 in DIE_TYPES', async () => {
        mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
        const user = userEvent.setup();
        renderSection(unresolvable);
        const dialog = await openDialog(user);

        const options = within(dialog)
          .getAllByRole('option')
          .map(o => o.textContent);
        expect(options).toEqual(['d4', 'd6', 'd8', 'd10', 'd12']);
      });

      // A character with no class at all reaches this the same way, and the
      // picker is right to appear — but copy blaming an unidentifiable class
      // would be describing a problem this sheet doesn't have.
      it('asks a classless sheet for a die without claiming its class failed to resolve', async () => {
        mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
        const user = userEvent.setup();
        renderSection({ hitDice: null, class: null });
        const dialog = await openDialog(user);

        expect(within(dialog).getByRole('combobox', { name: /hit die/i })).toBeInTheDocument();
        expect(within(dialog).getByText(/no hit dice are recorded/i)).toBeInTheDocument();
        expect(within(dialog).queryByText(/class data.*unavailable/i)).not.toBeInTheDocument();
      });

      // The two amber notes cover different facts — one that features can't be
      // suggested, one that the die is a guess — so both show, but neither
      // repeats the other.
      it('does not repeat the class-data advisory in the die note', async () => {
        mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
        const user = userEvent.setup();
        renderSection(unresolvable);
        const dialog = await openDialog(user);

        expect(within(dialog).getAllByText(/class data.*unavailable/i)).toHaveLength(1);
      });

      // The selector made `die` mutable mid-dialog for the first time, and `roll`
      // is a bare number with no record of which die produced it. Rolling high on
      // a d12 and then correcting to d4 would otherwise write the d12 result into
      // a permanent HP maximum beside a d4 pool.
      it('discards a roll taken on the previous die', async () => {
        mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
        mockRollDie.mockReturnValue(11);
        const user = userEvent.setup();
        renderSection(unresolvable);
        const dialog = await openDialog(user);

        await user.selectOptions(within(dialog).getByRole('combobox', { name: /hit die/i }), 'd12');
        await user.click(within(dialog).getByRole('radio', { name: /roll/i }));
        await user.click(within(dialog).getByRole('button', { name: /roll d12/i }));
        expect(within(dialog).getByTestId('hp-roll-result')).toHaveTextContent('11');

        await user.selectOptions(within(dialog).getByRole('combobox', { name: /hit die/i }), 'd4');

        expect(within(dialog).queryByTestId('hp-roll-result')).not.toBeInTheDocument();
        // And with no roll there is no gain, so confirm is blocked rather than
        // writing the stale number.
        expect(within(dialog).getByRole('button', { name: /confirm level up/i })).toBeDisabled();
      });

      // The sheet has no HP block, so applyLevelUp skips hitPoints entirely and
      // the pre-existing note says so. Promising a permanent maximum here would
      // contradict it; the die still matters because it seeds the pool.
      it('does not promise an HP change for a sheet with no hit points', async () => {
        mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
        const user = userEvent.setup();
        renderSection({ ...unresolvable, hitPoints: null });
        const dialog = await openDialog(user);

        expect(within(dialog).getByRole('combobox', { name: /hit die/i })).toBeInTheDocument();
        expect(within(dialog).getByText(/pool is seeded with d8/i)).toBeInTheDocument();
        expect(within(dialog).queryByText(/permanent maximum/i)).not.toBeInTheDocument();
      });

      it('rolls the picked die rather than a d8', async () => {
        mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
        mockRollDie.mockReturnValue(11);
        const user = userEvent.setup();
        renderSection(unresolvable);
        const dialog = await openDialog(user);

        await user.selectOptions(within(dialog).getByRole('combobox', { name: /hit die/i }), 'd12');
        await user.click(within(dialog).getByRole('radio', { name: /roll/i }));
        await user.click(within(dialog).getByRole('button', { name: /roll d12/i }));

        expect(mockRollDie).toHaveBeenCalledWith(12);
      });

      // Confirm stays enabled. The pre-existing comment rejects blocking because
      // it would make leveling impossible offline or for a custom class, and
      // VEG-528 deliberately did not reverse that — it removed the silent wrong
      // answer instead of removing the ability to level.
      it('still allows confirm — the die is asked for, not demanded', async () => {
        mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
        const user = userEvent.setup();
        renderSection(unresolvable);
        const dialog = await openDialog(user);
        expect(within(dialog).getByRole('button', { name: /confirm level up/i })).toBeEnabled();
      });

      it('does not ask when the class resolves and supplies a die', async () => {
        mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
        const user = userEvent.setup();
        renderSection({ hitDice: null });
        const dialog = await openDialog(user);
        expect(
          within(dialog).queryByRole('combobox', { name: /hit die/i })
        ).not.toBeInTheDocument();
      });

      // The sheet's own die always wins — a DM may have granted a nonstandard
      // one — so an unresolvable class is not on its own a reason to ask.
      it('does not ask when the sheet carries its own hit dice', async () => {
        mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
        const user = userEvent.setup();
        renderSection({ class: 'Pumpkin Sage' });
        const dialog = await openDialog(user);
        expect(
          within(dialog).queryByRole('combobox', { name: /hit die/i })
        ).not.toBeInTheDocument();
      });

      // Mid-fetch the class is indistinguishable from unresolvable. Asking then
      // would flash a selector in and pull it back out once the catalog lands.
      it('does not ask while the class catalog is still loading', async () => {
        mockUseApiQuery.mockReturnValue({ data: undefined, isPending: true });
        const user = userEvent.setup();
        renderSection(unresolvable);
        const dialog = await openDialog(user);
        expect(
          within(dialog).queryByRole('combobox', { name: /hit die/i })
        ).not.toBeInTheDocument();
      });
    });

    it('points casters at the Spells tab instead of managing spells inline', async () => {
      const user = userEvent.setup();
      renderSection({ spellcastingAbility: 'Intelligence' });
      const dialog = await openDialog(user);
      expect(within(dialog).getByText(/spell slots.*update automatically/i)).toBeInTheDocument();
    });

    it('shows no spell note for a non-caster', async () => {
      const user = userEvent.setup();
      renderSection();
      const dialog = await openDialog(user);
      expect(
        within(dialog).queryByText(/spell slots.*update automatically/i)
      ).not.toBeInTheDocument();
    });

    it('disables the level-up button and confirm while a write is in flight', async () => {
      const user = userEvent.setup();
      const character = makeCharacter();
      const { rerender } = render(<LevelUpSection character={character} {...editable} />);
      const dialog = await openDialog(user);
      rerender(<LevelUpSection character={character} {...editable} isSaving={true} />);
      expect(within(dialog).getByRole('button', { name: /confirm level up/i })).toBeDisabled();
    });

    it('closes the dialog if a concurrent edit brings the character to the level cap', async () => {
      // The section's atMax gate only hides the button; an already-open dialog
      // must not offer an impossible 20 → 21 transition.
      const user = userEvent.setup();
      const { rerender } = render(
        <LevelUpSection
          character={makeCharacter({ level: 19, experiencePoints: 305000 })}
          {...editable}
        />
      );
      const dialog = await openDialog(user);
      expect(within(dialog).getByText(/level 19 → 20/i)).toBeInTheDocument();
      rerender(
        <LevelUpSection
          character={makeCharacter({ level: 20, experiencePoints: 355000 })}
          {...editable}
        />
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('cannot open the dialog while a write is saving', () => {
      renderSection({}, { ...editable, isSaving: true });
      expect(screen.getByRole('button', { name: /level up/i })).toBeDisabled();
    });

    it('blocks confirm while the class catalog is still loading', async () => {
      mockUseApiQuery.mockReturnValue({ data: undefined, isPending: true });
      const user = userEvent.setup();
      renderSection();
      const dialog = await openDialog(user);
      expect(within(dialog).getByRole('button', { name: /confirm level up/i })).toBeDisabled();
    });

    it('does not wait for the catalog when the character has no class', async () => {
      mockUseApiQuery.mockReturnValue({ data: undefined, isPending: true });
      const user = userEvent.setup();
      renderSection({ class: undefined });
      const dialog = await openDialog(user);
      expect(within(dialog).getByRole('button', { name: /confirm level up/i })).toBeEnabled();
    });

    it('warns but still allows confirm when the class catalog failed to load', async () => {
      mockUseApiQuery.mockReturnValue({ data: undefined, isPending: false, isError: true });
      const user = userEvent.setup();
      renderSection();
      const dialog = await openDialog(user);
      expect(within(dialog).getByText(/class data.*unavailable/i)).toBeInTheDocument();
      const confirmButton = within(dialog).getByRole('button', { name: /confirm level up/i });
      expect(confirmButton).toBeEnabled();
      await user.click(confirmButton);
      expect(onPatch).toHaveBeenCalledTimes(1);
    });

    // The revert guard: a character knocked back a level and re-leveled must not
    // collect a second copy of the same grant. Keyed on name + source + level
    // since VEG-454, so the stored feature carries the level it was granted at.
    it('does not offer or re-append a feature the character already owns at that level', async () => {
      mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
      const user = userEvent.setup();
      renderSection({
        features: [
          { name: 'Extra Attack', source: 'Fighter', level: 6, description: 'Attack twice.' },
        ],
      });
      const dialog = await openDialog(user);
      expect(
        within(dialog).queryByRole('checkbox', { name: /extra attack/i })
      ).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: /confirm level up/i }));
      const patch = onPatch.mock.calls[0][0];
      expect(patch.features).toEqual([
        { name: 'Extra Attack', source: 'Fighter', level: 6, description: 'Attack twice.' },
        { name: 'Another Level-6 Boon', source: 'Fighter', level: 6 },
      ]);
    });

    // VEG-454, the bug itself. Owning the level-4 Ability Score Improvement must
    // not suppress the level-6 one — before the fix the section rendered nothing,
    // `applyLevelUp` wrote no feature, and no error was shown.
    it('still offers a recurring feature name at a level the character has not reached it', async () => {
      mockUseApiQuery.mockReturnValue({ data: [fighterWithRecurringAsi] });
      const user = userEvent.setup();
      renderSection({
        features: [
          {
            name: 'Ability Score Improvement',
            source: 'Fighter',
            level: 4,
            description: 'Raise an ability score.',
          },
        ],
      });
      const dialog = await openDialog(user);
      expect(
        within(dialog).getByRole('checkbox', { name: /ability score improvement/i })
      ).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: /confirm level up/i }));
      expect(onPatch.mock.calls[0][0].features).toEqual([
        {
          name: 'Ability Score Improvement',
          source: 'Fighter',
          level: 4,
          description: 'Raise an ability score.',
        },
        {
          name: 'Ability Score Improvement',
          source: 'Fighter',
          level: 6,
          description: 'Raise an ability score.',
        },
      ]);
    });

    // Features stored before VEG-454 carry no level, so they can't claim a
    // specific one. Re-offering is the deliberate choice over suppressing: the
    // checkbox is visible and the player can uncheck it, whereas suppression
    // would silently deny a legacy character every recurring grant it already
    // holds one copy of. The first post-fix level-up writes the level.
    it('re-offers a match against a legacy feature stored without a level', async () => {
      mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
      const user = userEvent.setup();
      renderSection({
        features: [{ name: 'Extra Attack', source: 'Fighter', description: 'Attack twice.' }],
      });
      const dialog = await openDialog(user);
      expect(within(dialog).getByRole('checkbox', { name: /extra attack/i })).toBeInTheDocument();
    });

    it('can be cancelled without patching', async () => {
      const user = userEvent.setup();
      renderSection();
      const dialog = await openDialog(user);
      await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(onPatch).not.toHaveBeenCalled();
    });
  });
  // VEG-524. VEG-506 let a user own a homebrew "Fighter" beside the SRD one, so
  // /srd/classes can return two rows with the same name. Resolving by name took
  // whichever sorted first, and the dialog reads two things off that row: the
  // per-level features it offers, and the hit die that hpGain turns into a
  // *permanent* HP maximum. Neither errors when it picks the wrong one.
  //
  // The catalogs below deliberately put the homebrew row first — the array order
  // that made the old `.find` return it for an SRD character.
  describe('resolving a duplicate class name (VEG-524)', () => {
    const homebrewFighter: SrdClass = {
      ...fighterClass,
      id: 'cls-hb-fighter',
      contentSource: 'homebrew',
      hitDie: 'd12',
      features: [{ name: 'Blood Frenzy', level: 6, description: 'Homebrew grant.' }],
    };
    // Asserted against BOTH orderings. With one order a name-based `.find`
    // coincidentally agrees with the id, so a single-order test would pass
    // against the very bug it guards; running both means one of the two always
    // discriminates, whichever row the query plan puts first.
    const orderings: [string, SrdClass[]][] = [
      ['homebrew first', [homebrewFighter, fighterClass]],
      ['SRD first', [fighterClass, homebrewFighter]],
    ];

    describe.each(orderings)('with the catalog returned %s', (_label, catalog) => {
      it('offers the features of the class the stored id names', async () => {
        mockUseApiQuery.mockReturnValue({ data: catalog });
        const user = userEvent.setup();
        renderSection({ class: 'Fighter', classId: 'cls-hb-fighter' });
        const dialog = await openDialog(user);

        expect(within(dialog).getByRole('checkbox', { name: /blood frenzy/i })).toBeInTheDocument();
        expect(within(dialog).queryByRole('checkbox', { name: /extra attack/i })).toBeNull();
      });

      it('offers the SRD features when the stored id names the SRD row', async () => {
        mockUseApiQuery.mockReturnValue({ data: catalog });
        const user = userEvent.setup();
        renderSection({ class: 'Fighter', classId: 'cls-fighter' });
        const dialog = await openDialog(user);

        expect(within(dialog).getByRole('checkbox', { name: /extra attack/i })).toBeInTheDocument();
        expect(within(dialog).queryByRole('checkbox', { name: /blood frenzy/i })).toBeNull();
      });

      // The HP consequence, stated directly: the seeded pool die follows the id.
      // Picking the wrong row here writes a wrong permanent maximum.
      it('seeds the homebrew hit die when the stored id names that row', async () => {
        mockUseApiQuery.mockReturnValue({ data: catalog });
        const user = userEvent.setup();
        renderSection({ class: 'Fighter', classId: 'cls-hb-fighter', hitDice: null });
        const dialog = await openDialog(user);
        await user.click(within(dialog).getByRole('button', { name: /confirm level up/i }));

        expect(onPatch).toHaveBeenCalledWith(
          expect.objectContaining({ hitDice: { dieType: 'd12', total: 6, spent: 0 } })
        );
      });

      it('seeds the SRD hit die when the stored id names the SRD row', async () => {
        mockUseApiQuery.mockReturnValue({ data: catalog });
        const user = userEvent.setup();
        renderSection({ class: 'Fighter', classId: 'cls-fighter', hitDice: null });
        const dialog = await openDialog(user);
        await user.click(within(dialog).getByRole('button', { name: /confirm level up/i }));

        expect(onPatch).toHaveBeenCalledWith(
          expect.objectContaining({ hitDice: { dieType: 'd10', total: 6, spent: 0 } })
        );
      });
    });

    const collidingCatalog = [homebrewFighter, fighterClass];

    // The intended degradation. A character saved before the column existed has
    // no id, and with two same-named rows there is no correct answer — so the
    // dialog warns instead of silently picking one and seeding its die.
    it('warns rather than guessing when a colliding name has no stored id', async () => {
      mockUseApiQuery.mockReturnValue({ data: collidingCatalog });
      const user = userEvent.setup();
      renderSection({ class: 'Fighter', classId: null });
      const dialog = await openDialog(user);

      expect(within(dialog).getByText(/class data is unavailable/i)).toBeInTheDocument();
      expect(within(dialog).queryByRole('checkbox', { name: /blood frenzy/i })).toBeNull();
      expect(within(dialog).queryByRole('checkbox', { name: /extra attack/i })).toBeNull();
    });

    // An unambiguous name still resolves with no id, so the millions of
    // characters predating the column keep working.
    it('still resolves an unambiguous name with no stored id', async () => {
      mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
      const user = userEvent.setup();
      renderSection({ class: 'Fighter', classId: null });
      const dialog = await openDialog(user);

      expect(within(dialog).getByRole('checkbox', { name: /extra attack/i })).toBeInTheDocument();
      expect(within(dialog).queryByText(/class data is unavailable/i)).toBeNull();
    });

    // Homebrew classes are deletable, so a persisted id outlives its row.
    it('degrades a stale id to the unambiguous-name path', async () => {
      mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
      const user = userEvent.setup();
      renderSection({ class: 'Fighter', classId: 'cls-deleted' });
      const dialog = await openDialog(user);

      expect(within(dialog).getByRole('checkbox', { name: /extra attack/i })).toBeInTheDocument();
      expect(within(dialog).queryByText(/class data is unavailable/i)).toBeNull();
    });
  });
});
