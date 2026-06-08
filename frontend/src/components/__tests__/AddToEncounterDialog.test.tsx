import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddToEncounterDialog from '@/components/AddToEncounterDialog';
import type { SrdMonster } from '@/lib/types';

function makeMonster(over: Partial<SrdMonster> = {}): SrdMonster {
  return {
    id: 'mon-goblin',
    name: 'Goblin',
    size: 'Small',
    type: 'Humanoid',
    alignment: 'neutral evil',
    armorClass: 15,
    hitPoints: 7,
    speed: '30 ft.',
    str: 8,
    dex: 14, // +2
    con: 10,
    int: 10,
    wis: 8,
    cha: 8,
    damageResistances: [],
    damageImmunities: [],
    damageVulnerabilities: [],
    conditionImmunities: [],
    challengeRating: 0.25,
    actions: [],
    source: 'SRD',
    ...over,
  } as SrdMonster;
}

const onConfirm = vi.fn();
const onCancel = vi.fn();

beforeEach(() => {
  onConfirm.mockReset();
  onCancel.mockReset();
});

function renderDialog(props: Partial<React.ComponentProps<typeof AddToEncounterDialog>> = {}) {
  return render(
    <AddToEncounterDialog
      monster={makeMonster()}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  );
}

describe('AddToEncounterDialog', () => {
  it('defaults to quantity 1 and hides the shared-initiative toggle for a single combatant', () => {
    renderDialog();
    expect((screen.getByLabelText(/quantity/i) as HTMLInputElement).value).toBe('1');
    expect(screen.queryByLabelText(/same initiative for all/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^initiative$/i)).toBeInTheDocument();
  });

  it('emits the manually entered initiative for a single combatant', async () => {
    const user = userEvent.setup();
    renderDialog();
    fireEvent.change(screen.getByLabelText(/^initiative$/i), { target: { value: '14' } });
    await user.click(screen.getByRole('button', { name: /add to encounter/i }));
    expect(onConfirm).toHaveBeenCalledWith({ quantity: 1, initiatives: [14] });
  });

  it('auto-rolls d20 + DEX mod into the shared field', async () => {
    const user = userEvent.setup();
    renderDialog({ rng: () => 0.5 }); // floor(0.5*20)+1 = 11; +2 DEX = 13
    await user.click(screen.getByRole('button', { name: /auto-roll d20/i }));
    expect((screen.getByLabelText(/^initiative$/i) as HTMLInputElement).value).toBe('13');
    await user.click(screen.getByRole('button', { name: /add to encounter/i }));
    expect(onConfirm).toHaveBeenCalledWith({ quantity: 1, initiatives: [13] });
  });

  it('shares one initiative across all combatants when quantity > 1 and the toggle is on', async () => {
    const user = userEvent.setup();
    renderDialog();
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '3' } });
    // Toggle is visible and on by default.
    expect((screen.getByLabelText(/same initiative for all/i) as HTMLInputElement).checked).toBe(
      true
    );
    fireEvent.change(screen.getByLabelText(/^initiative$/i), { target: { value: '14' } });
    await user.click(screen.getByRole('button', { name: /add to encounter/i }));
    expect(onConfirm).toHaveBeenCalledWith({ quantity: 3, initiatives: [14, 14, 14] });
  });

  it('exposes one initiative input per combatant when the shared toggle is off', async () => {
    const user = userEvent.setup();
    renderDialog();
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '3' } });
    await user.click(screen.getByLabelText(/same initiative for all/i)); // turn off

    const rows = screen.getAllByLabelText(/initiative for combatant/i) as HTMLInputElement[];
    expect(rows).toHaveLength(3);
    fireEvent.change(rows[0], { target: { value: '17' } });
    fireEvent.change(rows[1], { target: { value: '9' } });
    fireEvent.change(rows[2], { target: { value: '12' } });

    await user.click(screen.getByRole('button', { name: /add to encounter/i }));
    expect(onConfirm).toHaveBeenCalledWith({ quantity: 3, initiatives: [17, 9, 12] });
  });

  it('auto-rolls every row independently via "Auto-roll all"', async () => {
    const user = userEvent.setup();
    const seq = [0.0, 0.5, 0.999]; // d20 -> 1, 11, 20; +2 DEX -> 3, 13, 22
    let i = 0;
    renderDialog({ rng: () => seq[i++] });
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '3' } });
    await user.click(screen.getByLabelText(/same initiative for all/i)); // off
    await user.click(screen.getByRole('button', { name: /auto-roll all/i }));

    const rows = screen.getAllByLabelText(/initiative for combatant/i) as HTMLInputElement[];
    expect(rows.map(r => r.value)).toEqual(['3', '13', '22']);
    await user.click(screen.getByRole('button', { name: /add to encounter/i }));
    expect(onConfirm).toHaveBeenCalledWith({ quantity: 3, initiatives: [3, 13, 22] });
  });

  it('clamps quantity below 1 up to 1', async () => {
    const user = userEvent.setup();
    renderDialog();
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/^initiative$/i), { target: { value: '5' } });
    await user.click(screen.getByRole('button', { name: /add to encounter/i }));
    expect(onConfirm).toHaveBeenCalledWith({ quantity: 1, initiatives: [5] });
  });

  it('cancels without emitting', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables the confirm button while submitting', () => {
    renderDialog({ submitting: true });
    expect(screen.getByRole('button', { name: /add to encounter/i })).toBeDisabled();
  });
});
