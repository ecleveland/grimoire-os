import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InventorySection from '../InventorySection';
import type { Character } from '@/lib/types';

const baseCharacter: Character = {
  id: 'char-1',
  userId: 'user-1',
  name: 'Thorin Ironforge',
  race: 'Dwarf',
  class: 'Fighter',
  level: 5,
  subclass: 'Champion',
  background: 'Soldier',
  alignment: 'Lawful Good',
  experiencePoints: 6500,
  abilityScores: {
    strength: 16,
    dexterity: 12,
    constitution: 14,
    intelligence: 10,
    wisdom: 13,
    charisma: 8,
  },
  hitPoints: { max: 44, current: 44, temporary: 0 },
  deathSaves: { successes: 0, failures: 0 },
  armorClass: 18,
  speed: 25,
  initiative: 1,
  proficiencies: [],
  languages: [],
  savingThrows: [],
  skills: [],
  spells: [],
  attunedItems: [],
  spellSlots: [],
  inventory: [
    { name: 'Chain Mail', quantity: 1, weight: 55, equipped: true },
    { name: 'Longsword', quantity: 1, weight: 3, equipped: true },
    { name: 'Handaxe', quantity: 2, weight: 2, equipped: false },
    { name: 'Rope (50ft)', quantity: 1, equipped: false },
  ],
  currency: { cp: 10, sp: 25, ep: 0, gp: 150, pp: 5 },
  features: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('InventorySection', () => {
  describe('Equipment List', () => {
    it('renders the Equipment header', () => {
      render(<InventorySection character={baseCharacter} />);
      expect(screen.getByText('Equipment')).toBeInTheDocument();
    });

    it('renders all column headers', () => {
      render(<InventorySection character={baseCharacter} />);
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Qty')).toBeInTheDocument();
      expect(screen.getByText('Weight')).toBeInTheDocument();
      expect(screen.getByText('Equipped')).toBeInTheDocument();
    });

    it('renders inventory item names', () => {
      render(<InventorySection character={baseCharacter} />);
      expect(screen.getByText('Chain Mail')).toBeInTheDocument();
      expect(screen.getByText('Longsword')).toBeInTheDocument();
      expect(screen.getByText('Handaxe')).toBeInTheDocument();
      expect(screen.getByText('Rope (50ft)')).toBeInTheDocument();
    });

    it('renders item quantities', () => {
      render(<InventorySection character={baseCharacter} />);
      const rows = screen.getAllByRole('row');
      // Handaxe row (index 3) should show quantity 2
      const handaxeCells = rows[3].querySelectorAll('td');
      expect(handaxeCells[1].textContent).toBe('2');
    });

    it('renders item weight, showing dash when undefined', () => {
      render(<InventorySection character={baseCharacter} />);
      const rows = screen.getAllByRole('row');
      // Chain Mail row (index 1) should show weight 55
      const chainMailCells = rows[1].querySelectorAll('td');
      expect(chainMailCells[2].textContent).toBe('55');
      // Rope row (index 4) has no weight
      const ropeCells = rows[4].querySelectorAll('td');
      expect(ropeCells[2].textContent).toBe('—');
    });

    it('renders checkmark for equipped items', () => {
      render(<InventorySection character={baseCharacter} />);
      const rows = screen.getAllByRole('row');
      // Chain Mail (equipped)
      const chainMailEquipped = rows[1].querySelector('[data-testid="equipped-yes"]');
      expect(chainMailEquipped).toBeInTheDocument();
      // Handaxe (not equipped)
      const handaxeEquipped = rows[3].querySelector('[data-testid="equipped-no"]');
      expect(handaxeEquipped).toBeInTheDocument();
    });

    it('does not render Equipment section when inventory is empty', () => {
      const char = { ...baseCharacter, inventory: [] };
      render(<InventorySection character={char} />);
      expect(screen.queryByText('Equipment')).not.toBeInTheDocument();
    });
  });

  describe('Currency (Coins)', () => {
    it('renders the Coins header', () => {
      render(<InventorySection character={baseCharacter} />);
      expect(screen.getByText('Coins')).toBeInTheDocument();
    });

    it('renders all five denomination labels', () => {
      render(<InventorySection character={baseCharacter} />);
      expect(screen.getByText('CP')).toBeInTheDocument();
      expect(screen.getByText('SP')).toBeInTheDocument();
      expect(screen.getByText('EP')).toBeInTheDocument();
      expect(screen.getByText('GP')).toBeInTheDocument();
      expect(screen.getByText('PP')).toBeInTheDocument();
    });

    it('renders currency values', () => {
      render(<InventorySection character={baseCharacter} />);
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('25')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('150')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('does not render Coins section when all currency values are 0', () => {
      const char = { ...baseCharacter, currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } };
      render(<InventorySection character={char} />);
      expect(screen.queryByText('Coins')).not.toBeInTheDocument();
    });
  });

  describe('Attunement', () => {
    const attuned = {
      ...baseCharacter,
      attunedItems: [
        { name: 'Cloak of Protection' },
        { name: 'Ring of Evasion', itemId: '123e4567-e89b-42d3-a456-426614174000' },
      ],
    };

    it('renders the Attunement header and attuned item names', () => {
      render(<InventorySection character={attuned} />);
      expect(screen.getByText('Attunement')).toBeInTheDocument();
      expect(screen.getByText('Cloak of Protection')).toBeInTheDocument();
      expect(screen.getByText('Ring of Evasion')).toBeInTheDocument();
    });

    it('always shows 3 slots, filling the remainder with empty placeholders', () => {
      render(<InventorySection character={attuned} />);
      expect(screen.getAllByTestId('attunement-slot-filled')).toHaveLength(2);
      expect(screen.getAllByTestId('attunement-slot-empty')).toHaveLength(1);
    });

    it('caps display at 3 slots even if more are somehow present', () => {
      const overAttuned = {
        ...baseCharacter,
        attunedItems: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
      };
      render(<InventorySection character={overAttuned} />);
      expect(screen.getAllByTestId('attunement-slot-filled')).toHaveLength(3);
      expect(screen.queryByTestId('attunement-slot-empty')).not.toBeInTheDocument();
      expect(screen.queryByText('D')).not.toBeInTheDocument();
    });

    it('does not render the Attunement section when there are no attuned items', () => {
      render(<InventorySection character={baseCharacter} />);
      expect(screen.queryByText('Attunement')).not.toBeInTheDocument();
    });

    it('renders the section when attunement is the only content', () => {
      const char = {
        ...attuned,
        inventory: [],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      };
      render(<InventorySection character={char} />);
      expect(screen.getByText('Attunement')).toBeInTheDocument();
      expect(screen.queryByText('Equipment')).not.toBeInTheDocument();
      expect(screen.queryByText('Coins')).not.toBeInTheDocument();
    });
  });

  describe('conditional rendering', () => {
    it('renders nothing when inventory is empty and all currency is 0', () => {
      const char = {
        ...baseCharacter,
        inventory: [],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      };
      const { container } = render(<InventorySection character={char} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders only currency when inventory is empty but has coins', () => {
      const char = { ...baseCharacter, inventory: [] };
      render(<InventorySection character={char} />);
      expect(screen.queryByText('Equipment')).not.toBeInTheDocument();
      expect(screen.getByText('Coins')).toBeInTheDocument();
    });

    it('renders only equipment when inventory exists but currency is all 0', () => {
      const char = { ...baseCharacter, currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } };
      render(<InventorySection character={char} />);
      expect(screen.getByText('Equipment')).toBeInTheDocument();
      expect(screen.queryByText('Coins')).not.toBeInTheDocument();
    });
  });

  describe('currency adjuster (owner)', () => {
    const renderOwner = (over: Partial<Character> = {}, isSaving = false) => {
      const onPatch = vi.fn();
      render(
        <InventorySection
          character={{ ...baseCharacter, ...over }}
          editable
          onPatch={onPatch}
          isSaving={isSaving}
        />
      );
      return onPatch;
    };

    const selectCoin = async (user: ReturnType<typeof userEvent.setup>, label: string) =>
      user.click(screen.getByRole('button', { name: `Adjust ${label}` }));

    it('renders selectable coin tiles for an owner, with no adjuster shown initially', () => {
      renderOwner();
      expect(screen.getByRole('button', { name: 'Adjust GP' })).toBeInTheDocument();
      expect(screen.queryByTestId('coin-adjuster')).toBeNull();
    });

    it('shows the coin tiles for an owner even when all coins are 0', () => {
      renderOwner({ inventory: [], currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } });
      expect(screen.getByText('Coins')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Adjust GP' })).toBeInTheDocument();
    });

    it('reveals the adjuster for the selected denomination on click', async () => {
      const user = userEvent.setup();
      renderOwner();
      await selectCoin(user, 'GP');
      expect(screen.getByTestId('coin-adjuster')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Adjust GP' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    it('closes the adjuster when the selected coin is clicked again', async () => {
      const user = userEvent.setup();
      renderOwner();
      await selectCoin(user, 'GP');
      await selectCoin(user, 'GP');
      expect(screen.queryByTestId('coin-adjuster')).toBeNull();
    });

    it('adds the entered amount to the selected coin', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner();
      await selectCoin(user, 'GP'); // GP starts at 150
      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '50' } });
      await user.click(screen.getByRole('button', { name: 'Add' }));
      expect(onPatch).toHaveBeenCalledWith({
        currency: { cp: 10, sp: 25, ep: 0, gp: 200, pp: 5 },
      });
    });

    it('subtracts the entered amount from the selected coin', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner();
      await selectCoin(user, 'GP'); // 150
      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '30' } });
      await user.click(screen.getByRole('button', { name: 'Subtract' }));
      expect(onPatch).toHaveBeenCalledWith({
        currency: { cp: 10, sp: 25, ep: 0, gp: 120, pp: 5 },
      });
    });

    it('clamps a subtraction at 0 (never goes negative)', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner();
      await selectCoin(user, 'CP'); // CP starts at 10
      fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '999' } });
      await user.click(screen.getByRole('button', { name: 'Subtract' }));
      expect(onPatch).toHaveBeenCalledWith({
        currency: { cp: 0, sp: 25, ep: 0, gp: 150, pp: 5 },
      });
    });

    it('does not patch when the amount is empty or zero', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner();
      await selectCoin(user, 'GP');
      await user.click(screen.getByRole('button', { name: 'Add' }));
      expect(onPatch).not.toHaveBeenCalled();
    });

    it('disables the adjuster controls while a write is in flight', async () => {
      const user = userEvent.setup();
      renderOwner({}, true);
      await selectCoin(user, 'GP');
      expect(screen.getByLabelText('Amount')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Subtract' })).toBeDisabled();
    });

    it('shows static coin values (no tiles) for a non-owner', () => {
      render(<InventorySection character={baseCharacter} />);
      expect(screen.queryByRole('button', { name: /adjust/i })).toBeNull();
      expect(screen.getByText('150')).toBeInTheDocument();
    });
  });
});
