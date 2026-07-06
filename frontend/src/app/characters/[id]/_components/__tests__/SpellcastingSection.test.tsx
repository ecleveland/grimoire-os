import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpellcastingSection from '../SpellcastingSection';
import type { Character } from '@/lib/types';
import { makeCharacter } from '@/test-utils/character';

// The section fetches /srd/classes to resolve the prepared/known allowance
// (VEG-405). Mock just useApiQuery, leaving the rest of the query layer (used by
// useCharacterMutation) intact. Default to "no class data" so the existing,
// pre-indicator tests are unaffected; the indicator tests opt in per case.
const mockUseApiQuery = vi.fn();
vi.mock('@/lib/query', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/query')>()),
  useApiQuery: (path: string) => mockUseApiQuery(path),
}));

// Stub the catalog picker so these tests don't hit the debounced network search
// (covered in SrdSpellSearch.test.tsx). The stub fires onSelect with a fixed
// catalog spell when clicked.
const catalogSpell = {
  id: 'spell-x',
  name: 'Counterspell',
  level: 3,
  school: 'Abjuration',
  castingTime: '1 reaction',
  range: '60 feet',
  components: 'S',
  duration: 'Instantaneous',
  description: '',
  classes: [],
  ritual: false,
  concentration: false,
  source: 'SRD',
};
vi.mock('@/components/SrdSpellSearch', () => ({
  default: ({ onSelect }: { onSelect: (spell: typeof catalogSpell) => void }) => (
    <button type="button" onClick={() => onSelect(catalogSpell)}>
      stub-pick-spell
    </button>
  ),
}));

const baseCharacter = makeCharacter({
  class: 'Wizard',
  abilityScores: {
    strength: 8,
    dexterity: 14,
    constitution: 12,
    intelligence: 18,
    wisdom: 13,
    charisma: 10,
  },
  spellcastingAbility: 'Intelligence',
  spellSaveDC: 15,
  spellAttackBonus: 7,
  spells: [
    { level: 0, name: 'Fire Bolt' },
    { level: 0, name: 'Mage Hand' },
    { level: 1, name: 'Magic Missile', prepared: true },
    { level: 1, name: 'Shield', prepared: false },
    { level: 1, name: 'Detect Magic', prepared: true, ritual: true, concentration: true },
    {
      level: 3,
      name: 'Fireball',
      prepared: true,
      castingTime: '1 action',
      range: '150 feet',
      material: true,
    },
  ],
  spellSlots: [
    { level: 1, total: 4, used: 2 },
    { level: 2, total: 3, used: 1 },
    { level: 3, total: 2, used: 0 },
  ],
});

describe('SpellcastingSection', () => {
  beforeEach(() => {
    // Default: class list not yet resolved → no allowance indicator.
    mockUseApiQuery.mockReturnValue({ data: undefined });
  });

  describe('preparation limit indicator (VEG-405)', () => {
    const WIZARD_CLASS = {
      id: 'wizard',
      name: 'Wizard',
      spellcasting: {
        ability: 'Intelligence',
        cantripsKnown: { 5: 4 },
        preparedFormula: 'level + intelligence modifier',
      },
    };

    it('shows cantrip and prepared counts against the class allowance', () => {
      mockUseApiQuery.mockReturnValue({ data: [WIZARD_CLASS] });
      render(<SpellcastingSection character={baseCharacter} />);
      // L5 wizard, INT 18 (+4) → prepared allowance 9, cantrips allowed 4.
      // baseCharacter: 2 cantrips; prepared leveled = Magic Missile, Detect Magic, Fireball = 3.
      expect(screen.getByTestId('cantrip-summary')).toHaveTextContent('2 / 4');
      expect(screen.getByTestId('leveled-summary')).toHaveTextContent('Prepared 3 / 9');
      expect(screen.queryByTestId('prep-over-warning')).toBeNull();
    });

    it('warns (non-blocking) when the prepared/known count exceeds the allowance', () => {
      mockUseApiQuery.mockReturnValue({
        data: [
          {
            ...WIZARD_CLASS,
            spellcasting: { ...WIZARD_CLASS.spellcasting, cantripsKnown: { 5: 1 } },
          },
        ],
      });
      render(<SpellcastingSection character={baseCharacter} />);
      // cantrips allowed 1, character has 2 → over.
      expect(screen.getByTestId('cantrip-summary')).toHaveTextContent('2 / 1');
      expect(screen.getByTestId('prep-over-warning')).toBeInTheDocument();
    });

    it('labels the budget "Known" for known casters', () => {
      mockUseApiQuery.mockReturnValue({
        data: [
          {
            id: 'sorcerer',
            name: 'Sorcerer',
            spellcasting: {
              ability: 'Charisma',
              cantripsKnown: { 5: 5 },
              spellsKnown: { 5: 6 },
            },
          },
        ],
      });
      const sorcerer = { ...baseCharacter, class: 'Sorcerer', spellcastingAbility: 'Charisma' };
      render(<SpellcastingSection character={sorcerer} />);
      // Leveled spells listed (level>0) = Magic Missile, Shield, Detect Magic, Fireball = 4.
      expect(screen.getByTestId('leveled-summary')).toHaveTextContent('Known 4 / 6');
    });

    it('does not render the indicator when class spellcasting data is unavailable', () => {
      mockUseApiQuery.mockReturnValue({ data: undefined });
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.queryByTestId('prep-summary')).toBeNull();
    });

    it('surfaces the budget for a read-only caster even with no spells yet', () => {
      mockUseApiQuery.mockReturnValue({ data: [WIZARD_CLASS] });
      // No `editable` → read-only; empty spell list. The card (and indicator)
      // must still render so the budget is visible.
      render(<SpellcastingSection character={{ ...baseCharacter, spells: [] }} />);
      expect(screen.getByTestId('prep-summary')).toBeInTheDocument();
      expect(screen.getByTestId('cantrip-summary')).toHaveTextContent('0 / 4');
      expect(screen.getByTestId('leveled-summary')).toHaveTextContent('Prepared 0 / 9');
    });
  });

  describe('conditional rendering', () => {
    it('renders nothing when spellcastingAbility is undefined', () => {
      const char = { ...baseCharacter, spellcastingAbility: undefined };
      const { container } = render(<SpellcastingSection character={char} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders when spellcastingAbility is set', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('Spellcasting Ability')).toBeInTheDocument();
    });
  });

  describe('Spellcasting Stats Bar', () => {
    it('renders the spellcasting ability name', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('Intelligence')).toBeInTheDocument();
    });

    it('renders the spellcasting modifier calculated from ability score', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      // INT 18 → modifier +4
      expect(screen.getByText('+4')).toBeInTheDocument();
    });

    it('renders the spell save DC', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('Spell Save DC')).toBeInTheDocument();
    });

    it('renders the spell attack bonus', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('+7')).toBeInTheDocument();
      expect(screen.getByText('Spell Attack Bonus')).toBeInTheDocument();
    });

    it('renders all four stat labels', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('Spellcasting Ability')).toBeInTheDocument();
      expect(screen.getByText('Spellcasting Modifier')).toBeInTheDocument();
      expect(screen.getByText('Spell Save DC')).toBeInTheDocument();
      expect(screen.getByText('Spell Attack Bonus')).toBeInTheDocument();
    });
  });

  describe('Spell Slots Grid', () => {
    it('renders the Spell Slots header', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('Spell Slots')).toBeInTheDocument();
    });

    it('renders spell slot levels', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('Level 1')).toBeInTheDocument();
      expect(screen.getByText('Level 2')).toBeInTheDocument();
      expect(screen.getByText('Level 3')).toBeInTheDocument();
    });

    it('renders filled diamonds for used slots and empty diamonds for remaining', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      // Level 1: 4 total, 2 used → 2 filled + 2 empty
      const level1Row = screen.getByTestId('spell-slots-level-1');
      const filled = level1Row.querySelectorAll('[data-testid="slot-filled"]');
      const empty = level1Row.querySelectorAll('[data-testid="slot-empty"]');
      expect(filled).toHaveLength(2);
      expect(empty).toHaveLength(2);
    });

    it('renders all slots as empty when none are used', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      const level3Row = screen.getByTestId('spell-slots-level-3');
      const filled = level3Row.querySelectorAll('[data-testid="slot-filled"]');
      const empty = level3Row.querySelectorAll('[data-testid="slot-empty"]');
      expect(filled).toHaveLength(0);
      expect(empty).toHaveLength(2);
    });

    it('does not render spell slots section when spellSlots is empty', () => {
      const char = { ...baseCharacter, spellSlots: [] };
      render(<SpellcastingSection character={char} />);
      expect(screen.queryByText('Spell Slots')).not.toBeInTheDocument();
    });

    it('renders non-interactive pips for a non-owner', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.queryByRole('button', { name: /level 1 slot/i })).toBeNull();
    });
  });

  describe('spell slot controls (owner)', () => {
    const renderOwner = (over: Partial<Character> = {}, isSaving = false) => {
      const onPatch = vi.fn();
      render(
        <SpellcastingSection
          character={{ ...baseCharacter, ...over }}
          editable
          onPatch={onPatch}
          isSaving={isSaving}
        />
      );
      return onPatch;
    };

    it('expends an empty slot (sets used up to the clicked pip)', async () => {
      const user = userEvent.setup();
      // Level 3: total 2, used 0 — click the first pip → used 1.
      const onPatch = renderOwner();
      await user.click(screen.getByRole('button', { name: 'Level 3 slot 1' }));
      expect(onPatch).toHaveBeenCalledWith({
        spellSlots: [
          { level: 1, total: 4, used: 2 },
          { level: 2, total: 3, used: 1 },
          { level: 3, total: 2, used: 1 },
        ],
      });
    });

    it('restores the highest used slot when its pip is re-clicked', async () => {
      const user = userEvent.setup();
      // Level 2: total 3, used 1 — re-clicking pip 1 (the highest filled) → used 0.
      const onPatch = renderOwner();
      await user.click(screen.getByRole('button', { name: 'Level 2 slot 1' }));
      const patched = onPatch.mock.calls[0][0].spellSlots.find(
        (s: { level: number }) => s.level === 2
      );
      expect(patched.used).toBe(0);
    });

    it('disables pips while a write is in flight', () => {
      renderOwner({}, true);
      expect(screen.getByRole('button', { name: 'Level 1 slot 1' })).toBeDisabled();
    });

    it('exposes used state to assistive tech via aria-pressed', () => {
      // Level 1: total 4, used 2 → slots 1-2 pressed, 3-4 not.
      renderOwner();
      expect(screen.getByRole('button', { name: 'Level 1 slot 2' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(screen.getByRole('button', { name: 'Level 1 slot 3' })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });
  });

  describe('Cantrips & Prepared Spells', () => {
    it('renders the Cantrips & Prepared Spells header', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('Cantrips & Prepared Spells')).toBeInTheDocument();
    });

    it('renders every structured spell by name', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      for (const name of [
        'Fire Bolt',
        'Mage Hand',
        'Magic Missile',
        'Shield',
        'Detect Magic',
        'Fireball',
      ]) {
        expect(screen.getByText(name)).toBeInTheDocument();
      }
    });

    it('renders the spell level for each entry', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      const fireball = screen.getByTestId('spell-Fireball');
      expect(within(fireball).getByText('3')).toBeInTheDocument();
    });

    it('sorts spells by level, then alphabetically within a level', () => {
      const char = {
        ...baseCharacter,
        spells: [
          { level: 3, name: 'Fireball' },
          { level: 0, name: 'Mage Hand' },
          { level: 1, name: 'Shield' },
          { level: 0, name: 'Fire Bolt' },
          { level: 1, name: 'Bless' },
        ],
      };
      render(<SpellcastingSection character={char} />);
      const order = screen
        .getAllByTestId(/^spell-(?!slots-)/)
        .map(r => r.getAttribute('data-testid'));
      expect(order).toEqual([
        'spell-Fire Bolt', // level 0 (Fire < Mage)
        'spell-Mage Hand', // level 0
        'spell-Bless', // level 1 (Bless < Shield)
        'spell-Shield', // level 1
        'spell-Fireball', // level 3
      ]);
    });

    it('treats a leveled spell with no prepared flag as not prepared', () => {
      const char = { ...baseCharacter, spells: [{ level: 1, name: 'Bless' }] };
      render(<SpellcastingSection character={char} />);
      const row = screen.getByTestId('spell-Bless');
      expect(within(row).getByTestId('prepared-no')).toBeInTheDocument();
      expect(within(row).queryByTestId('prepared-yes')).not.toBeInTheDocument();
    });

    it('renders em-dash fallbacks for a spell missing casting time and range', () => {
      const char = { ...baseCharacter, spells: [{ level: 1, name: 'Bless' }] };
      render(<SpellcastingSection character={char} />);
      const cells = within(screen.getByTestId('spell-Bless')).getAllByRole('cell');
      // columns: [prep, level, name, casting time, range, C·R·M, notes]
      expect(cells[3].textContent).toBe('—');
      expect(cells[4].textContent).toBe('—');
    });

    it('renders a spell note when present', () => {
      const char = {
        ...baseCharacter,
        spells: [{ level: 1, name: 'Bless', notes: 'pinch of holy water' }],
      };
      render(<SpellcastingSection character={char} />);
      expect(
        within(screen.getByTestId('spell-Bless')).getByText('pinch of holy water')
      ).toBeInTheDocument();
    });

    it('shows the C·R·M flags for a spell that has them', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      // Detect Magic: Concentration + Ritual.
      const detect = screen.getByTestId('spell-Detect Magic');
      expect(within(detect).getByTestId('flag-concentration')).toBeInTheDocument();
      expect(within(detect).getByTestId('flag-ritual')).toBeInTheDocument();
      expect(within(detect).queryByTestId('flag-material')).not.toBeInTheDocument();
      // Fireball: Material only.
      const fireball = screen.getByTestId('spell-Fireball');
      expect(within(fireball).getByTestId('flag-material')).toBeInTheDocument();
      expect(within(fireball).queryByTestId('flag-concentration')).not.toBeInTheDocument();
    });

    it('renders casting time and range when present', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      const fireball = screen.getByTestId('spell-Fireball');
      expect(within(fireball).getByText('1 action')).toBeInTheDocument();
      expect(within(fireball).getByText('150 feet')).toBeInTheDocument();
    });

    it('marks leveled spells as prepared or not, and exempts cantrips', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      // Magic Missile (level 1, prepared) → filled indicator.
      expect(
        within(screen.getByTestId('spell-Magic Missile')).getByTestId('prepared-yes')
      ).toBeInTheDocument();
      // Shield (level 1, not prepared) → empty indicator.
      expect(
        within(screen.getByTestId('spell-Shield')).getByTestId('prepared-no')
      ).toBeInTheDocument();
      // Fire Bolt (cantrip) → no prepared indicator at all.
      const cantrip = screen.getByTestId('spell-Fire Bolt');
      expect(within(cantrip).queryByTestId('prepared-yes')).not.toBeInTheDocument();
      expect(within(cantrip).queryByTestId('prepared-no')).not.toBeInTheDocument();
    });

    it('does not render the spell list section when there are no spells', () => {
      const char = { ...baseCharacter, spells: [] };
      render(<SpellcastingSection character={char} />);
      expect(screen.queryByText('Cantrips & Prepared Spells')).not.toBeInTheDocument();
    });
  });

  describe('spell management (owner)', () => {
    const renderOwner = (over: Partial<Character> = {}, isSaving = false) => {
      const onPatch = vi.fn();
      render(
        <SpellcastingSection
          character={{ ...baseCharacter, ...over }}
          editable
          onPatch={onPatch}
          isSaving={isSaving}
        />
      );
      return onPatch;
    };

    it('shows the spell panel and add form for an owner with no spells', () => {
      renderOwner({ spells: [] });
      expect(screen.getByText('Cantrips & Prepared Spells')).toBeInTheDocument();
      expect(screen.getByTestId('add-spell-form')).toBeInTheDocument();
    });

    it('does not show spell remove/add/toggle controls for a non-owner', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
      expect(screen.queryByRole('button', { name: /^Toggle prepared/ })).toBeNull();
      expect(screen.queryByTestId('add-spell-form')).toBeNull();
    });

    it('toggles prepared on the correct STORED entry despite the display sort', async () => {
      const user = userEvent.setup();
      // Stored order differs from the level/name display sort.
      const onPatch = renderOwner({
        spells: [
          { level: 3, name: 'Fireball', prepared: true },
          { level: 0, name: 'Fire Bolt' },
          { level: 1, name: 'Shield', prepared: false },
        ],
      });
      await user.click(screen.getByRole('button', { name: 'Toggle prepared Shield' }));
      // Shield is stored at index 2; only it flips.
      expect(onPatch).toHaveBeenCalledWith({
        spells: [
          { level: 3, name: 'Fireball', prepared: true },
          { level: 0, name: 'Fire Bolt' },
          { level: 1, name: 'Shield', prepared: true },
        ],
      });
    });

    it('removes the correct STORED entry despite the display sort', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner({
        spells: [
          { level: 3, name: 'Fireball', prepared: true },
          { level: 0, name: 'Fire Bolt' },
          { level: 1, name: 'Shield' },
        ],
      });
      await user.click(screen.getByRole('button', { name: 'Remove Fireball' }));
      expect(onPatch).toHaveBeenCalledWith({
        spells: [
          { level: 0, name: 'Fire Bolt' },
          { level: 1, name: 'Shield' },
        ],
      });
    });

    it('does not render a prepared toggle for a cantrip', () => {
      renderOwner({ spells: [{ level: 0, name: 'Fire Bolt' }] });
      expect(screen.queryByRole('button', { name: 'Toggle prepared Fire Bolt' })).toBeNull();
    });

    it('adds a free-typed leveled spell (defaults to prepared)', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner({ spells: [] });
      fireEvent.change(screen.getByLabelText('New spell name'), { target: { value: 'Bless' } });
      fireEvent.change(screen.getByLabelText('New spell level'), { target: { value: '1' } });
      await user.click(screen.getByRole('button', { name: 'Add spell' }));
      expect(onPatch).toHaveBeenCalledWith({
        spells: [{ level: 1, name: 'Bless', prepared: true }],
      });
    });

    it('clamps an added spell level to 9', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner({ spells: [] });
      fireEvent.change(screen.getByLabelText('New spell name'), { target: { value: 'Wish' } });
      fireEvent.change(screen.getByLabelText('New spell level'), { target: { value: '12' } });
      await user.click(screen.getByRole('button', { name: 'Add spell' }));
      expect(onPatch.mock.calls[0][0].spells[0].level).toBe(9);
    });

    it('disables Add until a name is entered', () => {
      renderOwner({ spells: [] });
      expect(screen.getByRole('button', { name: 'Add spell' })).toBeDisabled();
      fireEvent.change(screen.getByLabelText('New spell name'), { target: { value: 'Bless' } });
      expect(screen.getByRole('button', { name: 'Add spell' })).toBeEnabled();
    });

    it('adds a catalog spell mapped to a structured entry with C·R·M + spellId', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner({ spells: [] });
      await user.click(screen.getByRole('button', { name: 'stub-pick-spell' }));
      expect(onPatch).toHaveBeenCalledWith({
        spells: [
          {
            level: 3,
            name: 'Counterspell',
            prepared: true,
            castingTime: '1 reaction',
            range: '60 feet',
            concentration: false,
            ritual: false,
            material: false,
            spellId: 'spell-x',
          },
        ],
      });
    });

    it('disables spell controls while a write is in flight', () => {
      renderOwner({ spells: [{ level: 1, name: 'Shield', prepared: false }] }, true);
      expect(screen.getByRole('button', { name: 'Remove Shield' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Toggle prepared Shield' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Add spell' })).toBeDisabled();
    });
  });

  describe('spell-card popover (VEG-413)', () => {
    const FIREBALL_ROW = {
      id: 'sp-99',
      name: 'Fireball',
      level: 3,
      school: 'Evocation',
      castingTime: '1 action',
      range: '150 feet',
      components: 'V, S, M',
      duration: 'Instantaneous',
      description: 'A bright streak flashes from your pointing finger.',
      classes: ['Wizard'],
      ritual: false,
      concentration: false,
      source: 'SRD',
      contentSource: 'srd',
    };

    // Resolve the catalog fetch for linked entries; everything else (the
    // /srd/classes allowance query) keeps the default "no data" behaviour.
    const mockCatalog = (row: unknown = FIREBALL_ROW) =>
      mockUseApiQuery.mockImplementation((path: string) =>
        path.startsWith('/srd/spells/')
          ? { data: row, isLoading: false, isError: false }
          : { data: undefined }
      );

    it('renders each spell name as a button and opens a free-typed card (read-only viewer)', async () => {
      const user = userEvent.setup();
      // Viewer: no `editable` prop. baseCharacter's spells are all free-typed.
      render(<SpellcastingSection character={baseCharacter} />);

      const trigger = screen.getByRole('button', { name: 'View Magic Missile details' });
      await user.click(trigger);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // Free-typed entry → no catalog fetch, shows the not-linked hint.
      expect(mockUseApiQuery).not.toHaveBeenCalledWith('/srd/spells/undefined');
      expect(screen.getByTestId('not-linked-hint')).toBeInTheDocument();
    });

    it('fetches the catalog row and renders full detail for a linked entry', async () => {
      const user = userEvent.setup();
      mockCatalog();
      render(
        <SpellcastingSection
          character={{
            ...baseCharacter,
            spells: [{ level: 3, name: 'Fireball', prepared: true, spellId: 'sp-99' }],
          }}
        />
      );

      await user.click(screen.getByRole('button', { name: 'View Fireball details' }));

      expect(mockUseApiQuery).toHaveBeenCalledWith('/srd/spells/sp-99');
      expect(screen.getByText(/A bright streak flashes/)).toBeInTheDocument();
      expect(screen.queryByTestId('not-linked-hint')).toBeNull();
    });

    it('lets the owner open the card too', async () => {
      const user = userEvent.setup();
      render(
        <SpellcastingSection
          character={{ ...baseCharacter, spells: [{ level: 1, name: 'Shield', prepared: true }] }}
          editable
          onPatch={vi.fn()}
        />
      );

      await user.click(screen.getByRole('button', { name: 'View Shield details' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });
});

describe('computed spellcasting is the source of truth (VEG-412)', () => {
  beforeEach(() => {
    mockUseApiQuery.mockReturnValue({ data: undefined });
  });

  // Computed numbers that DISAGREE with both the stored columns (spellSaveDC 15,
  // spellAttackBonus 7) and client math over INT 18 (+4) — the stats bar must
  // follow computed, proving the stored/derived divergence seam is closed.
  const divergent: Character = {
    ...baseCharacter,
    computed: {
      ...baseCharacter.computed,
      spellcasting: { ability: 'Intelligence', modifier: 5, saveDC: 19, attackBonus: 11 },
    },
  };

  it('renders modifier, save DC and attack bonus from computed.spellcasting', () => {
    render(<SpellcastingSection character={divergent} />);
    expect(screen.getByText('+5')).toBeInTheDocument();
    expect(screen.getByText('19')).toBeInTheDocument();
    expect(screen.getByText('+11')).toBeInTheDocument();
    // The stored columns and client-derived values must NOT render.
    expect(screen.queryByText('15')).toBeNull();
    expect(screen.queryByText('+7')).toBeNull();
    expect(screen.queryByText('+4')).toBeNull();
  });

  it('feeds the computed modifier into the preparation budget', () => {
    mockUseApiQuery.mockReturnValue({
      data: [
        {
          id: 'wizard',
          name: 'Wizard',
          spellcasting: {
            ability: 'Intelligence',
            cantripsKnown: { 5: 4 },
            preparedFormula: 'level + intelligence modifier',
          },
        },
      ],
    });
    render(<SpellcastingSection character={divergent} />);
    // level 5 + computed modifier 5 = 10 (client math over INT 18 would give 9).
    expect(screen.getByTestId('leveled-summary')).toHaveTextContent('Prepared 3 / 10');
  });

  it('still hides the section when the stored spellcastingAbility is unset, even if computed resolves one', () => {
    // The backend resolves a class-default ability into computed.spellcasting;
    // the sheet deliberately keeps gating on the stored column so this ticket
    // ships no visibility change (VEG-412 decision).
    const char: Character = { ...divergent, spellcastingAbility: undefined };
    const { container } = render(<SpellcastingSection character={char} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('spell-slot view merge (VEG-412)', () => {
  beforeEach(() => {
    mockUseApiQuery.mockReturnValue({ data: undefined });
  });

  const withSlots = (
    spellSlots: Character['spellSlots'],
    maxByLevel: Record<number, number>
  ): Character => ({
    ...baseCharacter,
    spellSlots,
    computed: {
      ...baseCharacter.computed,
      spellSlots: { caster: 'full', maxByLevel },
    },
  });

  const pips = (level: number) => {
    const row = screen.getByTestId(`spell-slots-level-${level}`);
    return {
      filled: row.querySelectorAll('[data-testid="slot-filled"]').length,
      empty: row.querySelectorAll('[data-testid="slot-empty"]').length,
    };
  };

  it('takes the pip count from the computed progression and used from stored', () => {
    render(
      <SpellcastingSection character={withSlots([{ level: 1, total: 4, used: 2 }], { 1: 6 })} />
    );
    expect(pips(1)).toEqual({ filled: 2, empty: 4 });
  });

  it('renders a computed-only level with all pips empty', () => {
    render(
      <SpellcastingSection
        character={withSlots([{ level: 1, total: 4, used: 2 }], { 1: 4, 2: 3 })}
      />
    );
    expect(pips(2)).toEqual({ filled: 0, empty: 3 });
  });

  it('keeps a stored-only level the progression does not cover (multiclass/DM-granted)', () => {
    render(
      <SpellcastingSection
        character={withSlots(
          [
            { level: 1, total: 4, used: 2 },
            { level: 5, total: 2, used: 1 },
          ],
          { 1: 4 }
        )}
      />
    );
    expect(pips(5)).toEqual({ filled: 1, empty: 1 });
  });

  it('lets the progression own the pip count at a covered level (self-heals a baked total)', () => {
    // A stored total inflated by an earlier write during a transient level
    // change must correct itself once the level (and its progression) reverts.
    render(
      <SpellcastingSection character={withSlots([{ level: 1, total: 4, used: 4 }], { 1: 2 })} />
    );
    expect(pips(1)).toEqual({ filled: 2, empty: 0 });
  });

  it('renders the progression even when the stored array is empty', () => {
    render(<SpellcastingSection character={withSlots([], { 1: 2, 2: 1 })} />);
    expect(pips(1)).toEqual({ filled: 0, empty: 2 });
    expect(pips(2)).toEqual({ filled: 0, empty: 1 });
  });

  it('expending a pip on a computed-only level upserts the stored entry', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(
      <SpellcastingSection
        character={withSlots([{ level: 1, total: 4, used: 2 }], { 1: 4, 2: 3 })}
        editable
        onPatch={onPatch}
        isSaving={false}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Level 2 slot 1' }));
    expect(onPatch).toHaveBeenCalledWith({
      spellSlots: [
        { level: 1, total: 4, used: 2 },
        { level: 2, total: 3, used: 1 },
      ],
    });
  });

  it('heals a stale stored total up to the computed max on write', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(
      <SpellcastingSection
        character={withSlots([{ level: 1, total: 3, used: 2 }], { 1: 4 })}
        editable
        onPatch={onPatch}
        isSaving={false}
      />
    );
    // View shows 4 pips (2 filled); clicking pip 3 expends up to 3 used.
    await user.click(screen.getByRole('button', { name: 'Level 1 slot 3' }));
    expect(onPatch).toHaveBeenCalledWith({
      spellSlots: [{ level: 1, total: 4, used: 3 }],
    });
  });
});
