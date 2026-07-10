import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WeaponsTable from '../WeaponsTable';
import { makeCharacter } from '@/test-utils/character';

const mockMessage = vi.fn();
vi.mock('sonner', () => ({ toast: { message: (...args: unknown[]) => mockMessage(...args) } }));

const mockCharacter = makeCharacter({
  weapons: [
    {
      name: 'Longsword',
      attackBonus: '+6',
      damage: '1d8+3',
      damageType: 'Slashing',
      notes: 'Versatile (1d10)',
    },
    { name: 'Handaxe', attackBonus: '+6', damage: '1d6+3', damageType: 'Slashing' },
    {
      name: 'Fire Bolt',
      attackBonus: 'DC 14',
      damage: '2d10',
      damageType: 'Fire',
      notes: 'Cantrip, 120ft',
    },
  ],
});

describe('WeaponsTable', () => {
  it('renders the section header', () => {
    render(<WeaponsTable character={mockCharacter} />);
    expect(screen.getByText('Weapons & Damage Cantrips')).toBeInTheDocument();
  });

  it('renders all column headers', () => {
    render(<WeaponsTable character={mockCharacter} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Atk Bonus / DC')).toBeInTheDocument();
    expect(screen.getByText('Damage & Type')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('renders weapon rows with correct data', () => {
    render(<WeaponsTable character={mockCharacter} />);
    expect(screen.getByText('Longsword')).toBeInTheDocument();
    expect(screen.getByText('Handaxe')).toBeInTheDocument();
    expect(screen.getByText('Fire Bolt')).toBeInTheDocument();
    expect(screen.getByText('DC 14')).toBeInTheDocument();
    const bonusCells = screen.getAllByText('+6');
    expect(bonusCells).toHaveLength(2);
  });

  it('combines damage and damageType in the Damage & Type column', () => {
    render(<WeaponsTable character={mockCharacter} />);
    expect(screen.getByText('1d8+3 Slashing')).toBeInTheDocument();
    expect(screen.getByText('2d10 Fire')).toBeInTheDocument();
  });

  it('renders notes when present', () => {
    render(<WeaponsTable character={mockCharacter} />);
    expect(screen.getByText('Versatile (1d10)')).toBeInTheDocument();
    expect(screen.getByText('Cantrip, 120ft')).toBeInTheDocument();
  });

  it('renders empty cell when notes are undefined', () => {
    render(<WeaponsTable character={mockCharacter} />);
    const rows = screen.getAllByRole('row');
    // Header + 3 weapon rows
    expect(rows).toHaveLength(4);
    // Handaxe row (index 2) should have empty notes cell
    const handaxeCells = rows[2].querySelectorAll('td');
    expect(handaxeCells[3].textContent).toBe('');
  });

  it('renders nothing when weapons is undefined', () => {
    const char = { ...mockCharacter, weapons: undefined };
    const { container } = render(<WeaponsTable character={char} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when weapons is empty', () => {
    const char = { ...mockCharacter, weapons: [] };
    const { container } = render(<WeaponsTable character={char} />);
    expect(container.innerHTML).toBe('');
  });

  // Derived weapon rows (VEG-410): equipped weapons with gear metadata surface
  // in the table via computed.weapons, ahead of manual entries.
  describe('derived weapons from equipped gear (VEG-410)', () => {
    const equippedBow = {
      name: 'Longbow',
      quantity: 1,
      equipped: true,
      gear: {
        type: 'weapon' as const,
        damage: '1d8',
        damageType: 'Piercing',
        properties: ['Heavy', 'Two-Handed'],
        ranged: true,
      },
    };

    it('renders a derived row for an equipped weapon with an "equipped" tag', () => {
      const char = makeCharacter({ weapons: [], inventory: [equippedBow] });
      render(<WeaponsTable character={char} />);
      // Dex 12 → +1, level 5 → prof +3.
      expect(screen.getByText('Longbow')).toBeInTheDocument();
      expect(screen.getByText('+4')).toBeInTheDocument();
      expect(screen.getByText(/1d8\+1 Piercing/)).toBeInTheDocument();
      expect(screen.getByTestId('derived-weapon-tag')).toBeInTheDocument();
    });

    it('renders derived rows before manual entries, untagged manual rows intact', () => {
      const char = makeCharacter({
        weapons: [{ name: 'Handaxe', attackBonus: '+6', damage: '1d6+3', damageType: 'Slashing' }],
        inventory: [equippedBow],
      });
      render(<WeaponsTable character={char} />);
      const rows = screen.getAllByRole('row');
      expect(rows).toHaveLength(3); // header + derived + manual
      expect(rows[1]).toHaveTextContent('Longbow');
      expect(rows[2]).toHaveTextContent('Handaxe');
      expect(screen.getAllByTestId('derived-weapon-tag')).toHaveLength(1);
    });

    it('renders a derived-only table when there are no manual weapons', () => {
      const char = makeCharacter({ weapons: undefined, inventory: [equippedBow] });
      render(<WeaponsTable character={char} />);
      expect(screen.getByText('Weapons & Damage Cantrips')).toBeInTheDocument();
      expect(screen.getByText('Longbow')).toBeInTheDocument();
    });

    it('offers roll buttons on derived rows when canRoll is set', async () => {
      const user = userEvent.setup();
      const char = makeCharacter({ weapons: [], inventory: [equippedBow] });
      render(<WeaponsTable character={char} canRoll />);
      await user.click(screen.getByRole('button', { name: 'Roll Longbow attack' }));
      expect(mockMessage).toHaveBeenLastCalledWith(expect.stringContaining('Longbow attack'));
    });
  });

  describe('dice rolls (canRoll)', () => {
    beforeEach(() => mockMessage.mockReset());

    it('renders no roll buttons when canRoll is falsy', () => {
      render(<WeaponsTable character={mockCharacter} />);
      expect(screen.queryByRole('button', { name: /roll longsword attack/i })).toBeNull();
    });

    it('rolls a weapon attack (d20 + parsed bonus)', async () => {
      const user = userEvent.setup();
      render(<WeaponsTable character={mockCharacter} canRoll />);
      await user.click(screen.getByRole('button', { name: 'Roll Longsword attack' }));
      expect(mockMessage).toHaveBeenLastCalledWith(expect.stringContaining('Longsword attack'));
    });

    it('rolls weapon damage from the damage expression', async () => {
      const user = userEvent.setup();
      render(<WeaponsTable character={mockCharacter} canRoll />);
      await user.click(screen.getByRole('button', { name: 'Roll Longsword damage' }));
      expect(mockMessage).toHaveBeenLastCalledWith(expect.stringContaining('Longsword damage'));
    });

    it('omits the attack button when the bonus is not a number (e.g. "DC 14")', () => {
      render(<WeaponsTable character={mockCharacter} canRoll />);
      // Fire Bolt has attackBonus "DC 14" — no leading modifier, so no Atk button…
      expect(screen.queryByRole('button', { name: 'Roll Fire Bolt attack' })).toBeNull();
      // …but its "2d10" damage is still rollable.
      expect(screen.getByRole('button', { name: 'Roll Fire Bolt damage' })).toBeInTheDocument();
    });
  });
});
