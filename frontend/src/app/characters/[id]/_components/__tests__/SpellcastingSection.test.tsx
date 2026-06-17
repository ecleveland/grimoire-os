import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpellcastingSection from '../SpellcastingSection';
import type { Character } from '@/lib/types';

const baseCharacter: Character = {
  id: 'char-1',
  userId: 'user-1',
  name: 'Elara Brightmoon',
  race: 'Elf',
  class: 'Wizard',
  level: 5,
  subclass: 'Evocation',
  background: 'Sage',
  alignment: 'Neutral Good',
  experiencePoints: 6500,
  abilityScores: {
    strength: 8,
    dexterity: 14,
    constitution: 12,
    intelligence: 18,
    wisdom: 13,
    charisma: 10,
  },
  hitPoints: { max: 32, current: 32, temporary: 0 },
  deathSaves: { successes: 0, failures: 0 },
  armorClass: 12,
  speed: 30,
  initiative: 2,
  proficiencies: [],
  languages: [],
  savingThrows: [],
  skills: [],
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
  inventory: [],
  attunedItems: [],
  currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  features: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('SpellcastingSection', () => {
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
});
