import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LootOddsAdvanced from '../LootOddsAdvanced';

describe('LootOddsAdvanced', () => {
  let onChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
  });

  it('renders collapsed by default', () => {
    render(<LootOddsAdvanced value={null} onChange={onChange} />);
    expect(screen.getByRole('button', { name: /loot odds/i })).toBeInTheDocument();
    expect(screen.queryByLabelText('Trinket Chance (%)')).not.toBeInTheDocument();
  });

  it('expands when toggled', async () => {
    const user = userEvent.setup();
    render(<LootOddsAdvanced value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /loot odds/i }));
    expect(screen.getByLabelText('Trinket Chance (%)')).toBeInTheDocument();
    expect(screen.getByLabelText('Magic Item Chance (%)')).toBeInTheDocument();
    expect(screen.getByLabelText('Item Count Die')).toBeInTheDocument();
    expect(screen.getByLabelText('Coinage Multiplier')).toBeInTheDocument();
  });

  it('shows "use global" hint when knob not overridden', async () => {
    const user = userEvent.setup();
    render(<LootOddsAdvanced value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /loot odds/i }));
    expect(screen.getAllByText(/using global default/i)).toHaveLength(4);
  });

  it('writes only changed knobs to onChange when slider moves', async () => {
    const user = userEvent.setup();
    render(<LootOddsAdvanced value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /loot odds/i }));
    const slider = screen.getByLabelText('Trinket Chance (%)') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '25' } });
    expect(onChange).toHaveBeenLastCalledWith({ trinketChance: 25 });
  });

  it('writes itemCountDie string when text changed', async () => {
    const user = userEvent.setup();
    render(<LootOddsAdvanced value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /loot odds/i }));
    fireEvent.change(screen.getByLabelText('Item Count Die'), { target: { value: '2d4' } });
    expect(onChange).toHaveBeenLastCalledWith({ itemCountDie: '2d4' });
  });

  it('per-knob reset removes only that knob', async () => {
    const user = userEvent.setup();
    const value = { trinketChance: 25, itemCountDie: '2d4' };
    render(<LootOddsAdvanced value={value} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /loot odds/i }));
    await user.click(screen.getByRole('button', { name: /reset trinket chance/i }));
    expect(onChange).toHaveBeenLastCalledWith({ itemCountDie: '2d4' });
  });

  it('reset all clears every knob (returns null)', async () => {
    const user = userEvent.setup();
    const value = { trinketChance: 25, itemCountDie: '2d4', coinageMultiplier: 2 };
    render(<LootOddsAdvanced value={value} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /loot odds/i }));
    await user.click(screen.getByRole('button', { name: /reset all/i }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('shows initial values when prop is set', async () => {
    const user = userEvent.setup();
    const value = { trinketChance: 30, itemCountDie: '1d6', coinageMultiplier: 3 };
    render(<LootOddsAdvanced value={value} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /loot odds/i }));
    const slider = screen.getByLabelText('Trinket Chance (%)') as HTMLInputElement;
    expect(slider.value).toBe('30');
    const die = screen.getByLabelText('Item Count Die') as HTMLInputElement;
    expect(die.value).toBe('1d6');
    const mult = screen.getByLabelText('Coinage Multiplier') as HTMLInputElement;
    expect(mult.value).toBe('3');
  });
});
