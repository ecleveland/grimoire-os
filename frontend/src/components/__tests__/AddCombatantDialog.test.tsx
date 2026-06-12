import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddCombatantDialog from '@/components/AddCombatantDialog';

const onConfirm = vi.fn();
const onCancel = vi.fn();

beforeEach(() => {
  onConfirm.mockReset();
  onCancel.mockReset();
});

function renderDialog(props: Partial<React.ComponentProps<typeof AddCombatantDialog>> = {}) {
  return render(<AddCombatantDialog onConfirm={onConfirm} onCancel={onCancel} {...props} />);
}

describe('AddCombatantDialog', () => {
  it('renders the form with sensible defaults and NPC checked', () => {
    renderDialog();
    expect((screen.getByLabelText(/^name$/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/^initiative$/i) as HTMLInputElement).value).toBe('10');
    expect((screen.getByLabelText(/^hp$/i) as HTMLInputElement).value).toBe('10');
    expect((screen.getByLabelText(/^max hp$/i) as HTMLInputElement).value).toBe('10');
    expect((screen.getByLabelText(/^ac$/i) as HTMLInputElement).value).toBe('10');
    expect(screen.getByLabelText(/^npc$/i)).toBeChecked();
    expect((screen.getByLabelText(/notes/i) as HTMLInputElement).value).toBe('');
  });

  it('disables confirm until a non-blank name is entered', async () => {
    const user = userEvent.setup();
    renderDialog();
    const confirm = screen.getByRole('button', { name: /add combatant/i });
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/^name$/i), '   ');
    expect(confirm).toBeDisabled();
    await user.type(screen.getByLabelText(/^name$/i), 'Trap');
    expect(confirm).toBeEnabled();
  });

  it('emits the filled-in values on confirm', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/^name$/i), 'Animated Armor');
    await user.clear(screen.getByLabelText(/^initiative$/i));
    await user.type(screen.getByLabelText(/^initiative$/i), '12');
    await user.clear(screen.getByLabelText(/^hp$/i));
    await user.type(screen.getByLabelText(/^hp$/i), '33');
    await user.clear(screen.getByLabelText(/^max hp$/i));
    await user.type(screen.getByLabelText(/^max hp$/i), '33');
    await user.clear(screen.getByLabelText(/^ac$/i));
    await user.type(screen.getByLabelText(/^ac$/i), '18');
    await user.type(screen.getByLabelText(/notes/i), 'lair guardian');
    await user.click(screen.getByRole('button', { name: /add combatant/i }));
    expect(onConfirm).toHaveBeenCalledWith({
      name: 'Animated Armor',
      initiative: 12,
      hp: 33,
      maxHp: 33,
      ac: 18,
      isNpc: true,
      notes: 'lair guardian',
    });
  });

  it('unchecking NPC emits isNpc false', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/^name$/i), 'Sidekick');
    await user.click(screen.getByLabelText(/^npc$/i));
    await user.click(screen.getByRole('button', { name: /add combatant/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ isNpc: false }));
  });

  it('parses cleared numeric fields as 0 instead of NaN', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/^name$/i), 'Hazard');
    await user.clear(screen.getByLabelText(/^initiative$/i));
    await user.clear(screen.getByLabelText(/^hp$/i));
    await user.click(screen.getByRole('button', { name: /add combatant/i }));
    expect(onConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ initiative: 0, hp: 0, maxHp: 10 })
    );
  });

  it('calls onCancel from the cancel button', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('disables confirm while the parent is submitting', async () => {
    const user = userEvent.setup();
    renderDialog({ submitting: true });
    await user.type(screen.getByLabelText(/^name$/i), 'Trap');
    expect(screen.getByRole('button', { name: /add combatant/i })).toBeDisabled();
  });
});
