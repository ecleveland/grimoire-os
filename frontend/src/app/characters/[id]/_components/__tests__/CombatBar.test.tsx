import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CombatBar from '../CombatBar';
import type { Character } from '@/lib/types';
import { makeCharacter } from '@/test-utils/character';

const mockCharacter = makeCharacter();

describe('CombatBar', () => {
  describe('Armor Class', () => {
    it('renders the AC value', () => {
      render(<CombatBar character={mockCharacter} />);
      const acBlock = screen.getByTestId('ac-block');
      expect(within(acBlock).getByText('18')).toBeInTheDocument();
    });

    it('renders the Armor Class label', () => {
      render(<CombatBar character={mockCharacter} />);
      expect(screen.getByText('Armor Class')).toBeInTheDocument();
    });
  });

  // Equipment-derived AC (VEG-410): the block shows computed.armorClass.effective —
  // derived from equipped gear, with the stored armorClass column as manual override.
  describe('Armor Class from equipped gear (VEG-410)', () => {
    const chainShirt = {
      name: 'Chain Shirt',
      quantity: 1,
      equipped: true,
      gear: { type: 'armor' as const, armorType: 'medium' as const, baseArmorClass: 13 },
    };
    const shield = {
      name: 'Shield',
      quantity: 1,
      equipped: true,
      gear: { type: 'armor' as const, armorType: 'shield' as const, armorClassBonus: 2 },
    };

    it('shows the derived AC with its breakdown when no override is set', () => {
      // Dex 12 → +1; medium 13 + 1 + shield 2 = 16.
      const char = makeCharacter({ armorClass: null, inventory: [chainShirt, shield] });
      render(<CombatBar character={char} />);
      const acBlock = screen.getByTestId('ac-block');
      expect(within(acBlock).getByText('16')).toBeInTheDocument();
      expect(screen.getByTestId('ac-breakdown')).toHaveTextContent('13 + 1 Dex + 2 shield');
    });

    it('labels a stored armorClass as a manual override', () => {
      const char = makeCharacter({ armorClass: 18, inventory: [chainShirt] });
      render(<CombatBar character={char} />);
      expect(within(screen.getByTestId('ac-block')).getByText('18')).toBeInTheDocument();
      expect(screen.getByTestId('ac-breakdown')).toHaveTextContent('manual override');
    });

    it('lets the owner reset a manual override back to the derived value', async () => {
      const onPatch = vi.fn();
      const char = makeCharacter({ armorClass: 18, inventory: [chainShirt] });
      render(<CombatBar character={char} editable onPatch={onPatch} isSaving={false} />);
      await userEvent.click(screen.getByRole('button', { name: 'Use derived AC' }));
      expect(onPatch).toHaveBeenCalledWith({ armorClass: null });
    });

    it('lets the owner set a manual override', async () => {
      const onPatch = vi.fn();
      const char = makeCharacter({ armorClass: null, inventory: [chainShirt] });
      render(<CombatBar character={char} editable onPatch={onPatch} isSaving={false} />);
      fireEvent.change(screen.getByLabelText('AC override'), { target: { value: '17' } });
      await userEvent.click(screen.getByRole('button', { name: 'Override' }));
      expect(onPatch).toHaveBeenCalledWith({ armorClass: 17 });
    });

    it('ignores an Override click with a blank or non-positive value', async () => {
      const onPatch = vi.fn();
      const char = makeCharacter({ armorClass: null, inventory: [chainShirt] });
      render(<CombatBar character={char} editable onPatch={onPatch} isSaving={false} />);
      await userEvent.click(screen.getByRole('button', { name: 'Override' }));
      fireEvent.change(screen.getByLabelText('AC override'), { target: { value: '0' } });
      await userEvent.click(screen.getByRole('button', { name: 'Override' }));
      expect(onPatch).not.toHaveBeenCalled();
    });

    it('shows no AC controls to a non-owner', () => {
      const char = makeCharacter({ armorClass: 18, inventory: [chainShirt] });
      render(<CombatBar character={char} />);
      expect(screen.queryByRole('button', { name: 'Use derived AC' })).toBeNull();
      expect(screen.queryByLabelText('AC override')).toBeNull();
    });

    it('renders a Dex penalty in the breakdown with a minus sign', () => {
      const char = makeCharacter({
        armorClass: null,
        abilityScores: {
          strength: 10,
          dexterity: 8,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        inventory: [chainShirt],
      });
      render(<CombatBar character={char} />);
      expect(screen.getByTestId('ac-breakdown')).toHaveTextContent('13 - 1 Dex');
    });

    it('degrades to the stored AC when a pre-VEG-410 payload lacks computed.armorClass', () => {
      // Version skew (old backend / cached payload): the sheet must render
      // like it used to, not white-screen — the documented null-crash class.
      const base = makeCharacter({ armorClass: 16 });
      const char = {
        ...base,
        computed: { ...base.computed, armorClass: undefined, weapons: undefined },
      } as unknown as Character;
      render(<CombatBar character={char} />);
      expect(within(screen.getByTestId('ac-block')).getByText('16')).toBeInTheDocument();
      expect(screen.queryByTestId('ac-breakdown')).toBeNull();
    });
  });

  describe('Hit Points', () => {
    it('renders current/max HP', () => {
      render(<CombatBar character={mockCharacter} />);
      const hpBlock = screen.getByTestId('hp-block');
      expect(within(hpBlock).getByText('32/44')).toBeInTheDocument();
    });

    it('shows temp HP when greater than 0', () => {
      render(<CombatBar character={mockCharacter} />);
      const hpBlock = screen.getByTestId('hp-block');
      expect(within(hpBlock).getByText('+5 temp')).toBeInTheDocument();
    });

    it('does not show temp HP when 0', () => {
      const char = { ...mockCharacter, hitPoints: { max: 44, current: 44, temporary: 0 } };
      render(<CombatBar character={char} />);
      const hpBlock = screen.getByTestId('hp-block');
      expect(within(hpBlock).queryByText(/temp/)).toBeNull();
    });

    it('shows green bar when HP > 50%', () => {
      const char = { ...mockCharacter, hitPoints: { max: 44, current: 30, temporary: 0 } };
      render(<CombatBar character={char} />);
      const bar = screen.getByTestId('hp-bar');
      expect(bar.className).toContain('bg-green');
    });

    it('shows yellow bar when HP is 25-50%', () => {
      const char = { ...mockCharacter, hitPoints: { max: 44, current: 15, temporary: 0 } };
      render(<CombatBar character={char} />);
      const bar = screen.getByTestId('hp-bar');
      expect(bar.className).toContain('bg-yellow');
    });

    it('shows red bar when HP < 25%', () => {
      const char = { ...mockCharacter, hitPoints: { max: 44, current: 5, temporary: 0 } };
      render(<CombatBar character={char} />);
      const bar = screen.getByTestId('hp-bar');
      expect(bar.className).toContain('bg-red');
    });
  });

  describe('Hit Dice', () => {
    it('renders spent/total with die type', () => {
      render(<CombatBar character={mockCharacter} />);
      const hdBlock = screen.getByTestId('hd-block');
      expect(within(hdBlock).getByText('3/8')).toBeInTheDocument();
      expect(within(hdBlock).getByText('d10')).toBeInTheDocument();
    });

    it('does not render Hit Dice block when hitDice is undefined', () => {
      const char = { ...mockCharacter, hitDice: undefined };
      render(<CombatBar character={char} />);
      expect(screen.queryByTestId('hd-block')).toBeNull();
    });
  });

  describe('Death Saves', () => {
    it('renders 3 success circles', () => {
      render(<CombatBar character={mockCharacter} />);
      const successCircles = screen.getAllByTestId(/^death-success-/);
      expect(successCircles).toHaveLength(3);
    });

    it('renders 3 failure circles', () => {
      render(<CombatBar character={mockCharacter} />);
      const failCircles = screen.getAllByTestId(/^death-failure-/);
      expect(failCircles).toHaveLength(3);
    });

    it('fills correct number of success circles', () => {
      // 2 successes: first 2 filled, third empty
      render(<CombatBar character={mockCharacter} />);
      expect(screen.getByTestId('death-success-0').className).toContain('bg-green');
      expect(screen.getByTestId('death-success-1').className).toContain('bg-green');
      expect(screen.getByTestId('death-success-2').className).not.toContain('bg-green');
    });

    it('fills correct number of failure circles', () => {
      // 1 failure: first filled, second and third empty
      render(<CombatBar character={mockCharacter} />);
      expect(screen.getByTestId('death-failure-0').className).toContain('bg-red');
      expect(screen.getByTestId('death-failure-1').className).not.toContain('bg-red');
      expect(screen.getByTestId('death-failure-2').className).not.toContain('bg-red');
    });

    it('renders all circles empty when no saves used', () => {
      const char = { ...mockCharacter, deathSaves: { successes: 0, failures: 0 } };
      render(<CombatBar character={char} />);
      for (let i = 0; i < 3; i++) {
        expect(screen.getByTestId(`death-success-${i}`).className).not.toContain('bg-green');
        expect(screen.getByTestId(`death-failure-${i}`).className).not.toContain('bg-red');
      }
    });
  });

  describe('heroic inspiration (read-only)', () => {
    it('renders an inspiration block reflecting the stored flag', () => {
      const on = render(<CombatBar character={{ ...mockCharacter, heroicInspiration: true }} />);
      expect(on.getByTestId('inspiration-state').className).toContain('text-amber');
      on.unmount();
      const off = render(<CombatBar character={{ ...mockCharacter, heroicInspiration: false }} />);
      expect(off.getByTestId('inspiration-state').className).not.toContain('text-amber');
    });

    it('shows no edit controls for a non-owner', () => {
      render(<CombatBar character={mockCharacter} />);
      expect(screen.queryByLabelText('HP amount')).toBeNull();
      expect(screen.queryByRole('button', { name: /toggle heroic inspiration/i })).toBeNull();
      expect(screen.queryByRole('button', { name: /spend hit die/i })).toBeNull();
    });
  });

  describe('play controls (owner)', () => {
    const renderOwner = (over: Partial<Character> = {}, isSaving = false) => {
      const onPatch = vi.fn();
      render(
        <CombatBar
          character={{ ...mockCharacter, ...over }}
          editable
          onPatch={onPatch}
          isSaving={isSaving}
        />
      );
      return onPatch;
    };

    it('applies damage (temp first, then current) through onPatch', () => {
      // current 32, temp 5; 8 damage → temp 0, current 29
      const onPatch = renderOwner();
      fireEvent.change(screen.getByLabelText('HP amount'), { target: { value: '8' } });
      fireEvent.click(screen.getByRole('button', { name: 'Damage' }));
      expect(onPatch).toHaveBeenCalledWith({ hitPoints: { max: 44, current: 29, temporary: 0 } });
    });

    it('heals clamped to max (no death-save change for a PC already above 0)', () => {
      const onPatch = renderOwner({
        hitPoints: { max: 44, current: 40, temporary: 0 },
        deathSaves: { successes: 0, failures: 0 },
      });
      fireEvent.change(screen.getByLabelText('HP amount'), { target: { value: '100' } });
      fireEvent.click(screen.getByRole('button', { name: 'Heal' }));
      expect(onPatch).toHaveBeenCalledWith({ hitPoints: { max: 44, current: 44, temporary: 0 } });
    });

    it('clears death saves when healing a downed PC above 0', () => {
      const onPatch = renderOwner({
        hitPoints: { max: 44, current: 0, temporary: 0 },
        deathSaves: { successes: 1, failures: 2 },
      });
      fireEvent.change(screen.getByLabelText('HP amount'), { target: { value: '5' } });
      fireEvent.click(screen.getByRole('button', { name: 'Heal' }));
      expect(onPatch).toHaveBeenCalledWith({
        hitPoints: { max: 44, current: 5, temporary: 0 },
        deathSaves: { successes: 0, failures: 0 },
      });
    });

    it('sets temp HP directly', () => {
      const onPatch = renderOwner({ hitPoints: { max: 44, current: 32, temporary: 5 } });
      fireEvent.change(screen.getByLabelText('HP amount'), { target: { value: '12' } });
      fireEvent.click(screen.getByRole('button', { name: 'Set Temp' }));
      expect(onPatch).toHaveBeenCalledWith({ hitPoints: { max: 44, current: 32, temporary: 12 } });
    });

    it('clears temp HP to 0 with an empty amount (Set Temp has no positive guard)', () => {
      // Unlike Damage/Heal, Set Temp intentionally fires on an empty field so a
      // player can zero out temp HP. Locks in that asymmetry.
      const onPatch = renderOwner({ hitPoints: { max: 44, current: 32, temporary: 9 } });
      fireEvent.click(screen.getByRole('button', { name: 'Set Temp' }));
      expect(onPatch).toHaveBeenCalledWith({ hitPoints: { max: 44, current: 32, temporary: 0 } });
    });

    it('ignores damage/heal with no positive amount', () => {
      const onPatch = renderOwner();
      fireEvent.click(screen.getByRole('button', { name: 'Damage' }));
      expect(onPatch).not.toHaveBeenCalled();
    });

    it('toggles a death-save pip', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner({ deathSaves: { successes: 0, failures: 0 } });
      await user.click(screen.getByRole('button', { name: 'Toggle failure 1' }));
      expect(onPatch).toHaveBeenCalledWith({ deathSaves: { successes: 0, failures: 1 } });
    });

    it('exposes filled state to assistive tech via aria-pressed', () => {
      renderOwner({ deathSaves: { successes: 2, failures: 0 } });
      expect(screen.getByRole('button', { name: 'Toggle success 1' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(screen.getByRole('button', { name: 'Toggle success 3' })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });

    it('spends and restores a hit die (clamped)', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner({ hitDice: { dieType: 'd10', total: 8, spent: 3 } });
      await user.click(screen.getByRole('button', { name: 'Spend hit die' }));
      expect(onPatch).toHaveBeenCalledWith({ hitDice: { dieType: 'd10', total: 8, spent: 4 } });
      await user.click(screen.getByRole('button', { name: 'Restore hit die' }));
      expect(onPatch).toHaveBeenCalledWith({ hitDice: { dieType: 'd10', total: 8, spent: 2 } });
    });

    it('disables spend at total and restore at 0', () => {
      renderOwner({ hitDice: { dieType: 'd10', total: 8, spent: 8 } });
      expect(screen.getByRole('button', { name: 'Spend hit die' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Restore hit die' })).toBeEnabled();
    });

    it('toggles heroic inspiration', async () => {
      const user = userEvent.setup();
      const onPatch = renderOwner({ heroicInspiration: false });
      await user.click(screen.getByRole('button', { name: /toggle heroic inspiration/i }));
      expect(onPatch).toHaveBeenCalledWith({ heroicInspiration: true });
    });

    it('disables all controls while a write is in flight', () => {
      renderOwner({}, true);
      expect(screen.getByRole('button', { name: 'Damage' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Spend hit die' })).toBeDisabled();
      expect(screen.getByRole('button', { name: /toggle heroic inspiration/i })).toBeDisabled();
    });

    it('performs a long rest as one composite patch (HP, hit dice, slots, death saves)', () => {
      // total 8 hit dice → regain 4; spent 6 → 2 remaining.
      const onPatch = renderOwner({
        hitPoints: { max: 44, current: 10, temporary: 7 },
        deathSaves: { successes: 1, failures: 2 },
        hitDice: { dieType: 'd10', total: 8, spent: 6 },
        spellSlots: [{ level: 1, total: 4, used: 4 }],
      });
      fireEvent.click(screen.getByRole('button', { name: 'Long Rest' }));
      expect(onPatch).toHaveBeenCalledWith({
        hitPoints: { max: 44, current: 44, temporary: 0 },
        deathSaves: { successes: 0, failures: 0 },
        hitDice: { dieType: 'd10', total: 8, spent: 2 },
        spellSlots: [{ level: 1, total: 4, used: 0 }],
      });
    });

    it('long rest omits hit dice and slots for a character without them', () => {
      const onPatch = renderOwner({
        hitPoints: { max: 30, current: 5, temporary: 0 },
        deathSaves: { successes: 0, failures: 0 },
        hitDice: undefined,
        spellSlots: [],
      });
      fireEvent.click(screen.getByRole('button', { name: 'Long Rest' }));
      expect(onPatch).toHaveBeenCalledWith({
        hitPoints: { max: 30, current: 30, temporary: 0 },
        deathSaves: { successes: 0, failures: 0 },
      });
    });

    it('long rests a non-caster whose spellSlots came back null without crashing', () => {
      // Regression (VEG-407): the API returns null spellSlots for non-casters
      // even though the Character type says non-optional. Clicking Long Rest
      // used to throw "Cannot read properties of null (reading 'length')".
      const onPatch = renderOwner({
        hitPoints: { max: 30, current: 4, temporary: 0 },
        deathSaves: { successes: 0, failures: 0 },
        hitDice: undefined,
        spellSlots: null as unknown as Character['spellSlots'],
      });
      fireEvent.click(screen.getByRole('button', { name: 'Long Rest' }));
      expect(onPatch).toHaveBeenCalledWith({
        hitPoints: { max: 30, current: 30, temporary: 0 },
        deathSaves: { successes: 0, failures: 0 },
      });
    });

    it('disables Long Rest while a write is in flight', () => {
      renderOwner({}, true);
      expect(screen.getByRole('button', { name: 'Long Rest' })).toBeDisabled();
    });

    // ── Short rest (VEG-409) ─────────────────────────────
    const ki = { name: 'Ki Points', max: 5, used: 3, recharge: 'short' as const };
    const rage = { name: 'Rage', max: 3, used: 2, recharge: 'long' as const };

    it("short rest recharges only 'short' resources, leaving everything else untouched", () => {
      const onPatch = renderOwner({
        hitPoints: { max: 44, current: 10, temporary: 7 },
        resources: [ki, rage],
      });
      fireEvent.click(screen.getByRole('button', { name: 'Short Rest' }));
      expect(onPatch).toHaveBeenCalledWith({
        resources: [{ ...ki, used: 0 }, rage],
      });
    });

    it('long rest also resets every resource in the composite patch', () => {
      const onPatch = renderOwner({
        hitPoints: { max: 44, current: 10, temporary: 7 },
        deathSaves: { successes: 0, failures: 0 },
        hitDice: undefined,
        spellSlots: [],
        resources: [ki, rage],
      });
      fireEvent.click(screen.getByRole('button', { name: 'Long Rest' }));
      expect(onPatch).toHaveBeenCalledWith({
        hitPoints: { max: 44, current: 44, temporary: 0 },
        deathSaves: { successes: 0, failures: 0 },
        resources: [
          { ...ki, used: 0 },
          { ...rage, used: 0 },
        ],
      });
    });

    it('disables Short Rest when the character has no resources (nothing to recover, no silent no-op)', () => {
      const onPatch = renderOwner({ resources: null as unknown as Character['resources'] });
      expect(screen.getByRole('button', { name: 'Short Rest' })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: 'Short Rest' }));
      expect(onPatch).not.toHaveBeenCalled();
    });

    it('disables Short Rest when only long-recharge resources exist or short pools are already full', () => {
      renderOwner({ resources: [rage, { ...ki, used: 0 }] });
      expect(screen.getByRole('button', { name: 'Short Rest' })).toBeDisabled();
    });

    it('enables Short Rest when a short-recharge resource has spent uses', () => {
      renderOwner({ resources: [ki] });
      expect(screen.getByRole('button', { name: 'Short Rest' })).toBeEnabled();
    });

    it('disables Short Rest while a write is in flight', () => {
      renderOwner({}, true);
      expect(screen.getByRole('button', { name: 'Short Rest' })).toBeDisabled();
    });
  });

  it('hides the Long Rest button for a non-owner', () => {
    render(<CombatBar character={mockCharacter} />);
    expect(screen.queryByRole('button', { name: 'Long Rest' })).toBeNull();
  });

  it('hides the Short Rest button for a non-owner', () => {
    render(<CombatBar character={mockCharacter} />);
    expect(screen.queryByRole('button', { name: 'Short Rest' })).toBeNull();
  });
});

describe('null hitPoints / armorClass (VEG-425)', () => {
  it('renders a zeroed HP block and the derived unarmored AC instead of crashing', () => {
    // A null armorClass is no longer a dash: it means "no override", so the
    // derived value (unarmored 10 + Dex 1 with an empty inventory) shows (VEG-410).
    const char = makeCharacter({ hitPoints: null, armorClass: null, inventory: [] });
    render(<CombatBar character={char} />);
    expect(within(screen.getByTestId('hp-block')).getByText('0/0')).toBeInTheDocument();
    expect(within(screen.getByTestId('ac-block')).getByText('11')).toBeInTheDocument();
  });

  it('disables HP write actions for a null-HP character so no fabricated block is persisted', async () => {
    const onPatch = vi.fn();
    const char = { ...mockCharacter, hitPoints: null };
    render(<CombatBar character={char} editable onPatch={onPatch} isSaving={false} />);
    // The display fallback renders, but Damage/Heal/Set Temp are disabled — a
    // long rest still works (clears death saves) without writing a fake HP block.
    expect(screen.getByRole('button', { name: 'Damage' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Heal' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Set Temp' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Long Rest' }));
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch.mock.calls[0][0]).not.toHaveProperty('hitPoints');
  });
});
