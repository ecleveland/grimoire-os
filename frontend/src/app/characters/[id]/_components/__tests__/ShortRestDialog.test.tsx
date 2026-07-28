import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ShortRestDialog from '../ShortRestDialog';
import { makeCharacter } from '@/test-utils/character';
import type { PatchOptions } from '../useCharacterMutation';
import type { CharacterPatch } from '../useCharacterMutation';

const mockToastMessage = vi.fn();
vi.mock('sonner', () => ({
  toast: { message: (...args: unknown[]) => mockToastMessage(...args) },
}));

beforeEach(() => {
  mockToastMessage.mockReset();
});

/** A deterministic `rng` producing the given 0..1 values in order, then 0. */
function seededRng(...values: number[]) {
  let i = 0;
  return () => values[i++] ?? 0;
}

function renderDialog(over: Parameters<typeof makeCharacter>[0] = {}, props = {}) {
  const onPatch = vi.fn();
  const onClose = vi.fn();
  // CON 14 → +2. d10 hit dice, 8 total / 3 spent → 5 available.
  const character = makeCharacter({
    hitPoints: { max: 44, current: 12, temporary: 0 },
    hitDice: { dieType: 'd10', total: 8, spent: 3 },
    resources: [],
    ...over,
  });
  render(
    <ShortRestDialog
      character={character}
      onPatch={onPatch}
      onClose={onClose}
      isSaving={false}
      {...props}
    />
  );
  return { character, onPatch, onClose };
}

/** Invoke the `onSuccess` handed to the most recent `onPatch` call. */
function resolveWrite(onPatch: ReturnType<typeof vi.fn>) {
  const [, options] = onPatch.mock.calls.at(-1) as [CharacterPatch, PatchOptions | undefined];
  options?.onSuccess?.();
}

describe('ShortRestDialog (VEG-487)', () => {
  it('shows how many hit dice are available to spend', () => {
    renderDialog();
    expect(screen.getByTestId('dice-available')).toHaveTextContent('5');
  });

  it('spends a die at the fixed average by default', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /spend a hit die/i }));

    // d10 average is 6, +2 CON = 8.
    expect(screen.getByTestId('heal-total')).toHaveTextContent('8');
  });

  it('rolls the die in roll mode using the injected rng', async () => {
    const user = userEvent.setup();
    // rollDie(10) with rng 0.65 → floor(6.5) + 1 = 7; +2 CON = 9.
    renderDialog({}, { rng: seededRng(0.65) });

    await user.click(screen.getByRole('radio', { name: /roll/i }));
    await user.click(screen.getByRole('button', { name: /spend a hit die/i }));

    expect(screen.getByTestId('heal-total')).toHaveTextContent('9');
    expect(screen.getByTestId('die-row-0')).toHaveTextContent('7');
  });

  it('accumulates multiple dice and previews the resulting HP', async () => {
    const user = userEvent.setup();
    renderDialog();

    const spend = screen.getByRole('button', { name: /spend a hit die/i });
    await user.click(spend);
    await user.click(spend);

    // Two average d10 dice: (6+2) * 2 = 16. HP 12 → 28 of 44.
    expect(screen.getByTestId('heal-total')).toHaveTextContent('16');
    expect(screen.getByTestId('hp-preview')).toHaveTextContent('28');
  });

  it('caps spending at the dice actually remaining', async () => {
    const user = userEvent.setup();
    // 8 total, 7 spent → exactly one available.
    renderDialog({ hitDice: { dieType: 'd10', total: 8, spent: 7 } });

    const spend = screen.getByRole('button', { name: /spend a hit die/i });
    await user.click(spend);

    expect(spend).toBeDisabled();
    expect(screen.getAllByTestId(/^die-row-/)).toHaveLength(1);
  });

  it('clamps the HP preview at max', async () => {
    const user = userEvent.setup();
    renderDialog({ hitPoints: { max: 44, current: 40, temporary: 0 } });

    const spend = screen.getByRole('button', { name: /spend a hit die/i });
    await user.click(spend);

    expect(screen.getByTestId('hp-preview')).toHaveTextContent('44');
  });

  it('dispatches one composite patch on confirm', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderDialog();

    await user.click(screen.getByRole('button', { name: /spend a hit die/i }));
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    expect(onPatch).toHaveBeenCalledTimes(1);
    const [fields] = onPatch.mock.calls[0];
    expect(fields).toMatchObject({
      hitPoints: { max: 44, current: 20, temporary: 0 },
      hitDice: { dieType: 'd10', total: 8, spent: 4 },
    });
  });

  it('toasts the summary and closes only once the write succeeds', async () => {
    const user = userEvent.setup();
    const { onPatch, onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: /spend a hit die/i }));
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    // Write still in flight — announcing it here could contradict a 409.
    expect(mockToastMessage).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    resolveWrite(onPatch);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockToastMessage).toHaveBeenCalledWith(expect.stringContaining('+8 HP'));
    expect(mockToastMessage).toHaveBeenCalledWith(expect.stringContaining('1 hit die'));
  });

  it('keeps the dialog open when the write fails, preserving the rolls', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: /spend a hit die/i }));
    await user.click(screen.getByRole('button', { name: /confirm/i }));

    // onSuccess never fires on a rejected write.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('heal-total')).toHaveTextContent('8');
  });

  it('lets a player undo the last die before confirming', async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /spend a hit die/i }));
    await user.click(screen.getByRole('button', { name: /remove last die/i }));

    expect(screen.queryByTestId('die-row-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('heal-total')).toHaveTextContent('0');
  });

  it('cannot confirm a rest that would change nothing', () => {
    // No dice spent and no short-recharge resources to recover.
    renderDialog();
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled();
  });

  it('allows a resource-only rest with no dice spent', async () => {
    const user = userEvent.setup();
    const { onPatch } = renderDialog({
      resources: [{ name: 'Ki Points', max: 5, used: 3, recharge: 'short' }],
    });

    await user.click(screen.getByRole('button', { name: /confirm/i }));

    const [fields] = onPatch.mock.calls[0];
    expect(fields.resources).toEqual([{ name: 'Ki Points', max: 5, used: 0, recharge: 'short' }]);
    expect('hitDice' in fields).toBe(false);
  });

  it('explains when there are no hit dice left to spend', () => {
    renderDialog({ hitDice: { dieType: 'd10', total: 8, spent: 8 } });

    expect(screen.getByRole('button', { name: /spend a hit die/i })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/no hit dice/i);
  });

  it('does not offer dice spending on a sheet with no hit points recorded', () => {
    renderDialog({ hitPoints: null });

    expect(screen.getByRole('status')).toHaveTextContent(/no hit points/i);
    expect(screen.queryByRole('button', { name: /spend a hit die/i })).not.toBeInTheDocument();
  });

  it('disables the controls while a write is in flight', () => {
    renderDialog({}, { isSaving: true });

    expect(screen.getByRole('button', { name: /spend a hit die/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled();
  });

  it('heals nothing when a CON penalty cancels the roll, but still spends the die', async () => {
    const user = userEvent.setup();
    // CON 6 → −2 modifier. rng 0 → rollDie(10) = 1; 1 − 2 floors at 0.
    const { onPatch } = renderDialog(
      {
        abilityScores: {
          strength: 10,
          dexterity: 10,
          constitution: 6,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
      },
      { rng: seededRng(0) }
    );

    await user.click(screen.getByRole('radio', { name: /roll/i }));
    await user.click(screen.getByRole('button', { name: /spend a hit die/i }));

    expect(screen.getByTestId('heal-total')).toHaveTextContent('0');

    await user.click(screen.getByRole('button', { name: /confirm/i }));
    const [fields] = onPatch.mock.calls[0];
    expect(fields.hitDice).toEqual({ dieType: 'd10', total: 8, spent: 4 });
    expect('hitPoints' in fields).toBe(false);
  });
});
