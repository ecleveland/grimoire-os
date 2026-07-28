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

  it('reports the healing actually gained, not the raw dice sum', async () => {
    const user = userEvent.setup();
    // 4 HP from max: a d10 average die rolls 8 of healing but only 4 lands.
    renderDialog({ hitPoints: { max: 44, current: 40, temporary: 0 } });

    await user.click(screen.getByRole('button', { name: /spend a hit die/i }));

    // Showing the unclamped 8 next to a "40 → 44" preview contradicts itself.
    expect(screen.getByTestId('heal-total')).toHaveTextContent('4');
    expect(screen.getByTestId('hp-preview')).toHaveTextContent('44');
  });

  it('warns when spending more dice than the wound needs', async () => {
    const user = userEvent.setup();
    renderDialog({ hitPoints: { max: 44, current: 42, temporary: 0 } });

    await user.click(screen.getByRole('button', { name: /spend a hit die/i }));

    // The die is spendable (5e allows it) but the player should be told it is
    // being wasted before they commit an irreversible resource.
    expect(screen.getByTestId('overheal-warning')).toBeInTheDocument();
  });

  it('does not warn when every point of healing lands', async () => {
    const user = userEvent.setup();
    renderDialog({ hitPoints: { max: 44, current: 12, temporary: 0 } });

    await user.click(screen.getByRole('button', { name: /spend a hit die/i }));

    expect(screen.queryByTestId('overheal-warning')).not.toBeInTheDocument();
  });

  it('never shows a negative count when dice are consumed elsewhere mid-dialog', async () => {
    const user = userEvent.setup();
    // Queue three dice, then re-render as if a 409 refetch left only one.
    const onPatch = vi.fn();
    const onClose = vi.fn();
    const base = {
      hitPoints: { max: 44, current: 12, temporary: 0 },
      hitDice: { dieType: 'd10' as const, total: 8, spent: 3 },
      resources: [],
    };
    const { rerender } = render(
      <ShortRestDialog
        character={makeCharacter(base)}
        onPatch={onPatch}
        onClose={onClose}
        isSaving={false}
      />
    );
    const spend = screen.getByRole('button', { name: /spend a hit die/i });
    await user.click(spend);
    await user.click(spend);
    await user.click(spend);
    expect(screen.getAllByTestId(/^die-row-/)).toHaveLength(3);

    rerender(
      <ShortRestDialog
        character={makeCharacter({ ...base, hitDice: { dieType: 'd10', total: 8, spent: 7 } })}
        onPatch={onPatch}
        onClose={onClose}
        isSaving={false}
      />
    );

    // One die left, so two queued rolls are no longer honourable — drop them
    // rather than render "-2 available" and silently discard them on write.
    expect(screen.getByTestId('dice-available')).toHaveTextContent('0');
    expect(screen.getAllByTestId(/^die-row-/)).toHaveLength(1);
    expect(screen.getByTestId('heal-total')).toHaveTextContent('8');
  });

  it('disables Cancel while a write is in flight', () => {
    // Cancelling mid-write closed the dialog as if nothing happened, while the
    // PATCH still landed and spent the die.
    renderDialog({}, { isSaving: true });
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeDisabled();
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

  it('survives a failed write: stays open, re-enables, and retries the same patch', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    const onClose = vi.fn();
    const character = makeCharacter({
      hitPoints: { max: 44, current: 12, temporary: 0 },
      hitDice: { dieType: 'd10', total: 8, spent: 3 },
      resources: [],
    });
    const props = { character, onPatch, onClose };
    const { rerender } = render(<ShortRestDialog {...props} isSaving={false} />);

    await user.click(screen.getByRole('button', { name: /spend a hit die/i }));
    await user.click(screen.getByRole('button', { name: /confirm short rest/i }));
    expect(onPatch).toHaveBeenCalledTimes(1);

    // Write in flight — controls lock.
    rerender(<ShortRestDialog {...props} isSaving />);
    expect(screen.getByRole('button', { name: /confirm short rest/i })).toBeDisabled();

    // Write rejects: onSuccess never runs, so the dialog neither closes nor
    // toasts, and `isSaving` releases. This is the path the 409 handler's
    // "reloaded the latest version — try again" toast tells the player to take.
    rerender(<ShortRestDialog {...props} isSaving={false} />);
    expect(onClose).not.toHaveBeenCalled();
    expect(mockToastMessage).not.toHaveBeenCalled();

    const confirm = screen.getByRole('button', { name: /confirm short rest/i });
    expect(confirm).toBeEnabled();
    expect(screen.getByRole('button', { name: /spend a hit die/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^cancel$/i })).toBeEnabled();
    // The roll survived, so retrying dispatches the identical patch.
    expect(screen.getByTestId('heal-total')).toHaveTextContent('8');

    await user.click(confirm);
    expect(onPatch).toHaveBeenCalledTimes(2);
    expect(onPatch.mock.calls[1][0]).toEqual(onPatch.mock.calls[0][0]);
  });

  it('does not resurrect rolls it already dropped if dice come back', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    const onClose = vi.fn();
    const base = {
      hitPoints: { max: 44, current: 12, temporary: 0 },
      hitDice: { dieType: 'd10' as const, total: 8, spent: 3 },
      resources: [],
    };
    const { rerender } = render(
      <ShortRestDialog
        character={makeCharacter(base)}
        onPatch={onPatch}
        onClose={onClose}
        isSaving={false}
      />
    );
    const spend = screen.getByRole('button', { name: /spend a hit die/i });
    await user.click(spend);
    await user.click(spend);
    await user.click(spend);

    // Another session spends dice → two rolls are dropped...
    rerender(
      <ShortRestDialog
        character={makeCharacter({ ...base, hitDice: { dieType: 'd10', total: 8, spent: 7 } })}
        onPatch={onPatch}
        onClose={onClose}
        isSaving={false}
      />
    );
    expect(screen.getAllByTestId(/^die-row-/)).toHaveLength(1);

    // ...then that session long-rests and the dice return. The dropped rolls
    // must stay dropped — silently reinstating them would re-queue a spend the
    // player already saw discarded.
    rerender(
      <ShortRestDialog
        character={makeCharacter({ ...base, hitDice: { dieType: 'd10', total: 8, spent: 0 } })}
        onPatch={onPatch}
        onClose={onClose}
        isSaving={false}
      />
    );
    expect(screen.getAllByTestId(/^die-row-/)).toHaveLength(1);
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
