import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatusTracker from '../StatusTracker';
import type { Character } from '@/lib/types';

function makeCharacter(over: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'Thorin Ironforge',
    level: 5,
    experiencePoints: 6500,
    abilityScores: null,
    hitPoints: null,
    deathSaves: null,
    armorClass: null,
    speed: null,
    initiative: null,
    proficiencies: [],
    languages: [],
    savingThrows: [],
    skills: [],
    spellSlots: null,
    inventory: null,
    currency: null,
    features: null,
    conditions: [],
    concentration: null,
    exhaustion: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  } as Character;
}

const onPatch = vi.fn();
const editable = { editable: true as const, onPatch, isSaving: false };

beforeEach(() => {
  onPatch.mockReset();
});

describe('StatusTracker', () => {
  describe('rendering', () => {
    it('renders empty state without crashing (no conditions, no concentration, no exhaustion)', () => {
      render(<StatusTracker character={makeCharacter()} />);
      expect(screen.getByText('Status')).toBeInTheDocument();
      expect(screen.getByText('No active conditions')).toBeInTheDocument();
    });

    it('tolerates null-ish legacy fields (conditions missing entirely)', () => {
      // A legacy row deserialized before the migration backfill patterns —
      // the component must guard, not crash (the VEG-425 lesson).
      const legacy = makeCharacter();
      // Simulate an API payload predating the columns.
      delete (legacy as unknown as Record<string, unknown>).conditions;
      delete (legacy as unknown as Record<string, unknown>).concentration;
      delete (legacy as unknown as Record<string, unknown>).exhaustion;
      render(<StatusTracker character={legacy} />);
      expect(screen.getByText('Status')).toBeInTheDocument();
    });

    it('renders a chip per active condition', () => {
      render(<StatusTracker character={makeCharacter({ conditions: ['Poisoned', 'Prone'] })} />);
      expect(screen.getByText('Poisoned')).toBeInTheDocument();
      expect(screen.getByText('Prone')).toBeInTheDocument();
    });

    it('renders the concentration chip with the spell name', () => {
      render(<StatusTracker character={makeCharacter({ concentration: { spell: 'Bless' } })} />);
      expect(screen.getByText('Concentrating: Bless')).toBeInTheDocument();
    });

    it('renders the concentration chip without a spell name', () => {
      render(<StatusTracker character={makeCharacter({ concentration: {} })} />);
      expect(screen.getByText('Concentrating')).toBeInTheDocument();
    });

    it('treats exhaustion 0 as none — no level label, no filled pips', () => {
      // The shared type documents "null (or 0) means none" (Combatant parity);
      // a 0 must not render a red "Level 0" badge over an empty track.
      render(<StatusTracker character={makeCharacter({ exhaustion: 0 })} />);
      expect(screen.queryByText(/^Level/)).not.toBeInTheDocument();
      for (const n of [1, 2, 3, 4, 5, 6]) {
        expect(screen.getByTestId(`exhaustion-pip-${n}`)).toHaveAttribute('data-filled', 'false');
      }
    });

    it('fills the exhaustion track to the current level', () => {
      render(<StatusTracker character={makeCharacter({ exhaustion: 3 })} />);
      for (const n of [1, 2, 3]) {
        expect(screen.getByTestId(`exhaustion-pip-${n}`)).toHaveAttribute('data-filled', 'true');
      }
      for (const n of [4, 5, 6]) {
        expect(screen.getByTestId(`exhaustion-pip-${n}`)).toHaveAttribute('data-filled', 'false');
      }
    });
  });

  describe('viewer (read-only)', () => {
    it('shows no add-condition select, remove buttons, or concentration controls', () => {
      render(
        <StatusTracker
          character={makeCharacter({
            conditions: ['Poisoned'],
            concentration: { spell: 'Bless' },
            exhaustion: 2,
          })}
        />
      );
      expect(screen.queryByLabelText('Add condition')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Remove Poisoned' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Stop concentrating' })).not.toBeInTheDocument();
      // Exhaustion pips render as inert spans, not buttons.
      expect(
        screen.queryByRole('button', { name: 'Set exhaustion level 1' })
      ).not.toBeInTheDocument();
    });
  });

  describe('owner interactions', () => {
    it('adds a condition via the select and patches the full list', async () => {
      render(
        <StatusTracker character={makeCharacter({ conditions: ['Poisoned'] })} {...editable} />
      );

      await userEvent.selectOptions(screen.getByLabelText('Add condition'), 'Prone');

      expect(onPatch).toHaveBeenCalledWith({ conditions: ['Poisoned', 'Prone'] });
    });

    it('offers only conditions not already active in the select', () => {
      render(
        <StatusTracker character={makeCharacter({ conditions: ['Poisoned'] })} {...editable} />
      );
      const select = screen.getByLabelText('Add condition');
      const options = Array.from(select.querySelectorAll('option')).map(o => o.textContent);
      expect(options).not.toContain('Poisoned');
      expect(options).toContain('Prone');
    });

    it('removes a condition via its chip ×', async () => {
      render(
        <StatusTracker
          character={makeCharacter({ conditions: ['Poisoned', 'Prone'] })}
          {...editable}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Remove Poisoned' }));

      expect(onPatch).toHaveBeenCalledWith({ conditions: ['Prone'] });
    });

    it('sets an exhaustion level by clicking a pip', async () => {
      render(<StatusTracker character={makeCharacter()} {...editable} />);

      await userEvent.click(screen.getByRole('button', { name: 'Set exhaustion level 3' }));

      expect(onPatch).toHaveBeenCalledWith({ exhaustion: 3 });
    });

    it('clears exhaustion by clicking the current level', async () => {
      render(<StatusTracker character={makeCharacter({ exhaustion: 3 })} {...editable} />);

      await userEvent.click(screen.getByRole('button', { name: 'Set exhaustion level 3' }));

      expect(onPatch).toHaveBeenCalledWith({ exhaustion: null });
    });

    it('starts concentrating with an empty concentration object', async () => {
      render(<StatusTracker character={makeCharacter()} {...editable} />);

      await userEvent.click(screen.getByRole('button', { name: 'Concentrate' }));

      expect(onPatch).toHaveBeenCalledWith({ concentration: {} });
    });

    it('names the concentration spell on blur (single atomic patch)', () => {
      render(<StatusTracker character={makeCharacter({ concentration: {} })} {...editable} />);

      // fireEvent.change sets the value atomically — userEvent.type would
      // exercise per-keystroke onChange, but commit happens on blur.
      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: 'Hold Person' } });
      fireEvent.blur(input);

      expect(onPatch).toHaveBeenCalledWith({ concentration: { spell: 'Hold Person' } });
    });

    it('commits the spell name on Enter', () => {
      render(<StatusTracker character={makeCharacter({ concentration: {} })} {...editable} />);

      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: 'Bless' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onPatch).toHaveBeenCalledWith({ concentration: { spell: 'Bless' } });
    });

    it('keeps the typed spell name visible while the write is in flight', () => {
      // Regression (VEG-408 review): the draft was cleared on commit, snapping
      // the input back to the stale server value until the PATCH round-tripped
      // — on a slow/failed request the typed name looked lost.
      render(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Bless' } })}
          {...editable}
        />
      );

      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: 'Hold Person' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onPatch).toHaveBeenCalledWith({ concentration: { spell: 'Hold Person' } });
      expect(input).toHaveValue('Hold Person');
    });

    it('adopts the refreshed server value once the write round-trips', () => {
      const { rerender } = render(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Bless' } })}
          {...editable}
        />
      );

      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: 'Hold Person' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // The refetch lands: the character prop now carries the committed value.
      rerender(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Hold Person' } })}
          {...editable}
        />
      );

      expect(screen.getByLabelText('Concentration spell')).toHaveValue('Hold Person');
    });

    it('commits exactly once when a blur immediately follows the Enter commit', () => {
      // Regression (PR #235 review): the draft survived the commit, so the
      // blur fired by the input disabling re-sent the PATCH with the same
      // stale expectedVersion — a spurious 409 toast on every spell commit.
      render(<StatusTracker character={makeCharacter({ concentration: {} })} {...editable} />);

      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: 'Bless' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.blur(input);

      expect(onPatch).toHaveBeenCalledTimes(1);
      expect(onPatch).toHaveBeenCalledWith({ concentration: { spell: 'Bless' } });
    });

    it('stop concentrating discards an uncommitted draft instead of committing it', () => {
      // Regression (PR #235 review): the input blur committed the draft first,
      // isSaving disabled the button before mouseup, and the stop was
      // swallowed — the user got a rename instead of a stop.
      render(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Bless' } })}
          {...editable}
        />
      );

      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: 'Fireball' } });
      const stop = screen.getByRole('button', { name: 'Stop concentrating' });
      fireEvent.mouseDown(stop);
      fireEvent.blur(input);
      fireEvent.click(stop);

      expect(onPatch).toHaveBeenCalledTimes(1);
      expect(onPatch).toHaveBeenCalledWith({ concentration: null });
    });

    it('keeps in-progress typing when the commit refetch lands mid-edit', () => {
      // Regression (PR #235 review): the draft-reset effect cleared on any
      // server-spell change, so a player who committed "Hold" and kept typing
      // to correct it had their keystrokes wiped when the refetch landed.
      const { rerender } = render(
        <StatusTracker character={makeCharacter({ concentration: {} })} {...editable} />
      );

      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: 'Hold' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.change(input, { target: { value: 'Hold Pers' } });

      // The commit's refetch lands: serverSpell is now 'Hold'.
      rerender(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Hold' }, version: 2 })}
          {...editable}
        />
      );

      expect(screen.getByLabelText('Concentration spell')).toHaveValue('Hold Pers');
    });

    it('does not resurface a stale draft on a new concentration after stopping', () => {
      const { rerender } = render(
        <StatusTracker character={makeCharacter({ concentration: {} })} {...editable} />
      );

      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: 'Hold Person' } });
      const stop = screen.getByRole('button', { name: 'Stop concentrating' });
      fireEvent.mouseDown(stop);
      fireEvent.blur(input);
      fireEvent.click(stop);

      // Stop round-trips, then the player concentrates again.
      rerender(<StatusTracker character={makeCharacter({ concentration: null })} {...editable} />);
      rerender(<StatusTracker character={makeCharacter({ concentration: {} })} {...editable} />);

      expect(screen.getByLabelText('Concentration spell')).toHaveValue('');
    });

    it('commits clearing a named spell (named → empty keeps concentrating)', () => {
      render(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Bless' } })}
          {...editable}
        />
      );

      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.blur(input);

      expect(onPatch).toHaveBeenCalledWith({ concentration: {} });
    });

    it('does not patch when the committed spell name is unchanged', () => {
      render(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Bless' } })}
          {...editable}
        />
      );

      const input = screen.getByLabelText('Concentration spell');
      fireEvent.blur(input);

      expect(onPatch).not.toHaveBeenCalled();
    });

    it('stops concentrating via the clear button', async () => {
      render(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Bless' } })}
          {...editable}
        />
      );

      await userEvent.click(screen.getByRole('button', { name: 'Stop concentrating' }));

      expect(onPatch).toHaveBeenCalledWith({ concentration: null });
    });

    it('disables all controls while a write is in flight', () => {
      render(
        <StatusTracker
          character={makeCharacter({ conditions: ['Poisoned'], concentration: {}, exhaustion: 1 })}
          editable
          onPatch={onPatch}
          isSaving
        />
      );

      expect(screen.getByLabelText('Add condition')).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Remove Poisoned' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Set exhaustion level 2' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Stop concentrating' })).toBeDisabled();
    });
  });
});
