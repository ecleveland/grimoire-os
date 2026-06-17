import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InventorySection from '../InventorySection';
import type { Character } from '@/lib/types';

// Stub the catalog picker so these tests don't exercise the debounced network
// search (covered in SrdItemSearch.test.tsx). The stub exposes a button that
// fires onSelect with a fixed catalog item.
const catalogItem = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  name: 'Ring of Protection',
  category: 'Ring',
  weight: 0,
  rarity: 'Rare',
};
vi.mock('@/components/SrdItemSearch', () => ({
  default: ({ onSelect }: { onSelect: (item: typeof catalogItem) => void }) => (
    <button type="button" onClick={() => onSelect(catalogItem)}>
      stub-pick-catalog
    </button>
  ),
}));

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

  describe('inventory editing (owner)', () => {
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

    it('shows the Equipment section and add form for an owner even with empty inventory', () => {
      renderOwner({ inventory: [] });
      expect(screen.getByText('Equipment')).toBeInTheDocument();
      expect(screen.getByTestId('add-item-form')).toBeInTheDocument();
    });

    it('does not show edit/remove controls for a non-owner', () => {
      render(<InventorySection character={baseCharacter} />);
      expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
      expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
      expect(screen.queryByTestId('add-item-form')).toBeNull();
    });

    it('renders a carrying-capacity readout (STR 16 → 240 lb, carried 62)', () => {
      // Chain Mail 55 + Longsword 3 + Handaxe 2×2=4 = 62; capacity 16×15 = 240.
      renderOwner();
      expect(screen.getByTestId('carrying-capacity')).toHaveTextContent('Carried 62 / 240 lb');
    });

    it('flags over-capacity when carried weight exceeds the limit', () => {
      renderOwner({
        abilityScores: { ...baseCharacter.abilityScores, strength: 3 }, // capacity 45
      });
      expect(screen.getByTestId('carrying-capacity')).toHaveTextContent('over capacity');
    });

    it('toggles a row equipped flag through patch', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner();
      await user.click(screen.getByRole('button', { name: 'Unequip Chain Mail' }));
      const next = onPatch.mock.calls[0][0].inventory;
      expect(next[0]).toMatchObject({ name: 'Chain Mail', equipped: false });
    });

    it('removes a row through patch', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner();
      await user.click(screen.getByRole('button', { name: 'Remove Handaxe' }));
      const next = onPatch.mock.calls[0][0].inventory;
      expect(next.map((i: { name: string }) => i.name)).toEqual([
        'Chain Mail',
        'Longsword',
        'Rope (50ft)',
      ]);
    });

    it('edits a row name/qty/weight and saves once', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner();
      await user.click(screen.getByRole('button', { name: 'Edit Handaxe' }));
      fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Throwing Axe' } });
      fireEvent.change(screen.getByLabelText('Item quantity'), { target: { value: '3' } });
      fireEvent.change(screen.getByLabelText('Item weight'), { target: { value: '2.5' } });
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onPatch).toHaveBeenCalledTimes(1);
      const next = onPatch.mock.calls[0][0].inventory;
      expect(next[2]).toMatchObject({ name: 'Throwing Axe', quantity: 3, weight: 2.5 });
    });

    it('cancels an edit without patching', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner();
      await user.click(screen.getByRole('button', { name: 'Edit Handaxe' }));
      fireEvent.change(screen.getByLabelText('Item name'), { target: { value: 'Nope' } });
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onPatch).not.toHaveBeenCalled();
      expect(screen.getByText('Handaxe')).toBeInTheDocument();
    });

    it('adds a free-typed item, clamping quantity to at least 1 and omitting blank weight', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner();
      fireEvent.change(screen.getByLabelText('New item name'), { target: { value: 'Torch' } });
      fireEvent.change(screen.getByLabelText('New item quantity'), { target: { value: '0' } });
      await user.click(screen.getByRole('button', { name: 'Add item' }));
      const next = onPatch.mock.calls[0][0].inventory;
      const added = next[next.length - 1];
      expect(added).toEqual({ name: 'Torch', quantity: 1, equipped: false });
      expect(added).not.toHaveProperty('weight');
      expect(added).not.toHaveProperty('itemId');
    });

    it('disables Add until a name is entered', async () => {
      renderOwner({ inventory: [] });
      expect(screen.getByRole('button', { name: 'Add item' })).toBeDisabled();
      fireEvent.change(screen.getByLabelText('New item name'), { target: { value: 'Torch' } });
      expect(screen.getByRole('button', { name: 'Add item' })).toBeEnabled();
    });

    it('autofills the add form and links the catalog item id when picked', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner({ inventory: [] });
      const form = screen.getByTestId('add-item-form');
      await user.click(within(form).getByRole('button', { name: 'stub-pick-catalog' }));
      expect(screen.getByLabelText('New item name')).toHaveValue('Ring of Protection');
      expect(screen.getByTestId('catalog-detail')).toHaveTextContent('Ring · Rare');
      await user.click(screen.getByRole('button', { name: 'Add item' }));
      const added = onPatch.mock.calls[0][0].inventory.at(-1);
      expect(added).toMatchObject({
        name: 'Ring of Protection',
        weight: 0,
        itemId: catalogItem.id,
        equipped: false,
      });
    });

    it('drops the catalog link if the name is hand-edited after a pick', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner({ inventory: [] });
      const form = screen.getByTestId('add-item-form');
      await user.click(within(form).getByRole('button', { name: 'stub-pick-catalog' }));
      fireEvent.change(screen.getByLabelText('New item name'), {
        target: { value: 'Custom Ring' },
      });
      expect(screen.queryByTestId('catalog-detail')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Add item' }));
      const added = onPatch.mock.calls[0][0].inventory.at(-1);
      expect(added).not.toHaveProperty('itemId');
      expect(added).toMatchObject({ name: 'Custom Ring' });
    });

    it('disables row actions while a write is in flight', () => {
      renderOwner({}, true);
      expect(screen.getByRole('button', { name: 'Edit Handaxe' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Remove Handaxe' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Add item' })).toBeDisabled();
    });

    it('does not patch when saving an edit with a blank name', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner();
      await user.click(screen.getByRole('button', { name: 'Edit Handaxe' }));
      fireEvent.change(screen.getByLabelText('Item name'), { target: { value: '   ' } });
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onPatch).not.toHaveBeenCalled();
    });

    it('keeps the existing weight when the weight field is cleared on save', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner();
      await user.click(screen.getByRole('button', { name: 'Edit Chain Mail' })); // weight 55
      fireEvent.change(screen.getByLabelText('Item weight'), { target: { value: '' } });
      await user.click(screen.getByRole('button', { name: 'Save' }));
      expect(onPatch.mock.calls[0][0].inventory[0]).toMatchObject({
        name: 'Chain Mail',
        weight: 55,
      });
    });

    it('closes an open editor when a different row is removed (no wrong-row overwrite)', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner();
      // Edit the Handaxe, then remove a *lower-indexed* row (Chain Mail).
      await user.click(screen.getByRole('button', { name: 'Edit Handaxe' }));
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Remove Chain Mail' }));
      // Editor is closed (no stale draft that could Save onto the shifted row)…
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
      // …and the only write was the removal.
      expect(onPatch).toHaveBeenCalledTimes(1);
      expect(onPatch.mock.calls[0][0].inventory.map((i: { name: string }) => i.name)).toEqual([
        'Longsword',
        'Handaxe',
        'Rope (50ft)',
      ]);
    });

    it('closes an open editor when the character is refetched (version bumps)', async () => {
      const user = userEvent.setup();
      const onPatch = vi.fn();
      const { rerender } = render(
        <InventorySection
          character={{ ...baseCharacter, version: 1 }}
          editable
          onPatch={onPatch}
          isSaving={false}
        />
      );
      await user.click(screen.getByRole('button', { name: 'Edit Handaxe' }));
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      // A refetch lands a new version with shifted inventory.
      rerender(
        <InventorySection
          character={{ ...baseCharacter, version: 2, inventory: [baseCharacter.inventory[1]] }}
          editable
          onPatch={onPatch}
          isSaving={false}
        />
      );
      expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    });
  });

  describe('attunement editing (owner)', () => {
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

    it('shows the Attunement section and add form for an owner with no attuned items', () => {
      renderOwner({ attunedItems: [] });
      expect(screen.getByText('Attunement')).toBeInTheDocument();
      expect(screen.getByTestId('add-attunement-form')).toBeInTheDocument();
    });

    it('does not show attunement remove/add controls for a non-owner', () => {
      render(
        <InventorySection
          character={{ ...baseCharacter, attunedItems: [{ name: 'Cloak of Protection' }] }}
        />
      );
      expect(screen.queryByRole('button', { name: /^Remove attunement/ })).toBeNull();
      expect(screen.queryByTestId('add-attunement-form')).toBeNull();
    });

    it('adds a free-typed attuned item through patch', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner({ attunedItems: [] });
      fireEvent.change(screen.getByLabelText('New attunement name'), {
        target: { value: 'Boots of Speed' },
      });
      await user.click(screen.getByRole('button', { name: 'Attune item' }));
      expect(onPatch).toHaveBeenCalledWith({ attunedItems: [{ name: 'Boots of Speed' }] });
    });

    it('adds a catalog-linked attuned item carrying itemId', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner({ attunedItems: [] });
      const form = screen.getByTestId('add-attunement-form');
      await user.click(within(form).getByRole('button', { name: 'stub-pick-catalog' }));
      expect(screen.getByLabelText('New attunement name')).toHaveValue('Ring of Protection');
      await user.click(screen.getByRole('button', { name: 'Attune item' }));
      expect(onPatch).toHaveBeenCalledWith({
        attunedItems: [{ name: 'Ring of Protection', itemId: catalogItem.id }],
      });
    });

    it('removes an attuned item through patch', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner({
        attunedItems: [{ name: 'Cloak of Protection' }, { name: 'Ring of Evasion' }],
      });
      await user.click(
        screen.getByRole('button', { name: 'Remove attunement Cloak of Protection' })
      );
      expect(onPatch).toHaveBeenCalledWith({ attunedItems: [{ name: 'Ring of Evasion' }] });
    });

    it('hides the add form and shows a full message when 3 items are attuned', () => {
      renderOwner({ attunedItems: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
      expect(screen.queryByTestId('add-attunement-form')).toBeNull();
      expect(screen.getByText(/slots full/i)).toBeInTheDocument();
      // Remove controls remain available for each filled slot.
      expect(screen.getAllByRole('button', { name: /^Remove attunement/ })).toHaveLength(3);
    });

    it('disables attunement controls while a write is in flight', () => {
      renderOwner({ attunedItems: [{ name: 'Cloak of Protection' }] }, true);
      expect(
        screen.getByRole('button', { name: 'Remove attunement Cloak of Protection' })
      ).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Attune item' })).toBeDisabled();
    });
  });
});
