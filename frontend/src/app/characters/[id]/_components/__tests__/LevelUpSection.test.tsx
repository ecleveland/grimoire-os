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
            { name: 'Extra Attack', source: 'Fighter', description: 'Attack twice.' },
            { name: 'Another Level-6 Boon', source: 'Fighter' },
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
        { name: 'Extra Attack', source: 'Fighter', description: 'Attack twice.' },
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

    it('does not offer or re-append a feature the character already owns', async () => {
      mockUseApiQuery.mockReturnValue({ data: [fighterClass] });
      const user = userEvent.setup();
      renderSection({
        features: [{ name: 'Extra Attack', source: 'Fighter', description: 'Attack twice.' }],
      });
      const dialog = await openDialog(user);
      expect(
        within(dialog).queryByRole('checkbox', { name: /extra attack/i })
      ).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: /confirm level up/i }));
      const patch = onPatch.mock.calls[0][0];
      expect(patch.features).toEqual([
        { name: 'Extra Attack', source: 'Fighter', description: 'Attack twice.' },
        { name: 'Another Level-6 Boon', source: 'Fighter' },
      ]);
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
});
