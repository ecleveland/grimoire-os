import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatusTracker from '../StatusTracker';
import type { Character } from '@/lib/types';
import { makeCharacter as makeBaseCharacter } from '@/test-utils/character';

// StatusTracker's empty-state tests hinge on the nullable stat columns being
// null (a legacy/minimal row), so this wrapper nulls them out over the shared
// factory's populated defaults before applying the caller's overrides.
function makeCharacter(over: Partial<Character> = {}): Character {
  return makeBaseCharacter({
    abilityScores: null,
    hitPoints: null,
    deathSaves: null,
    armorClass: null,
    speed: null,
    initiative: null,
    spellSlots: null,
    inventory: null,
    currency: null,
    features: null,
    ...over,
  });
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

  // VEG-449: the sheet's saves/skills/initiative/speed all drop while exhausted,
  // so the track states what the level costs rather than leaving the numbers to
  // change for no visible reason.
  describe('exhaustion effect summary', () => {
    it.each([
      [1, '−2 to d20 Tests · −5 ft Speed'],
      [3, '−6 to d20 Tests · −15 ft Speed'],
      [5, '−10 to d20 Tests · −25 ft Speed'],
    ])('summarizes the level-%i penalty', (level, expected) => {
      render(<StatusTracker character={makeCharacter({ exhaustion: level })} />);
      expect(screen.getByTestId('exhaustion-effect')).toHaveTextContent(expected);
    });

    it('renders no summary when the character is not exhausted', () => {
      render(<StatusTracker character={makeCharacter()} />);
      expect(screen.queryByTestId('exhaustion-effect')).not.toBeInTheDocument();
    });

    it('renders no summary at exhaustion 0', () => {
      render(<StatusTracker character={makeCharacter({ exhaustion: 0 })} />);
      expect(screen.queryByTestId('exhaustion-effect')).not.toBeInTheDocument();
    });

    it('reports death at level 6 instead of a penalty', () => {
      render(<StatusTracker character={makeCharacter({ exhaustion: 6 })} />);
      expect(screen.getByTestId('exhaustion-effect')).toHaveTextContent('Death');
      expect(screen.getByTestId('exhaustion-effect')).not.toHaveTextContent('d20');
    });

    it('reads the computed block rather than recomputing the rule client-side', () => {
      // Stored level 2 with a divergent computed block: the summary must follow
      // computed, which is what the sheet's other numbers were derived from.
      const base = makeCharacter({ exhaustion: 2 });
      const char = {
        ...base,
        computed: {
          ...base.computed,
          exhaustion: { level: 4, d20Penalty: -8, speedPenalty: 20, dead: false },
        },
      };
      render(<StatusTracker character={char} />);
      expect(screen.getByTestId('exhaustion-effect')).toHaveTextContent(
        '−8 to d20 Tests · −20 ft Speed'
      );
    });

    it('survives a legacy payload with no computed exhaustion field', () => {
      const base = makeCharacter({ exhaustion: 3 });
      const char = { ...base, computed: { ...base.computed, exhaustion: null } };
      render(<StatusTracker character={char} />);
      // The track still renders; only the effect line is absent.
      expect(screen.getByTestId('exhaustion-pip-3')).toHaveAttribute('data-filled', 'true');
      expect(screen.queryByTestId('exhaustion-effect')).not.toBeInTheDocument();
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

    it('names the concentration spell via the Save button (single atomic patch)', () => {
      render(<StatusTracker character={makeCharacter({ concentration: {} })} {...editable} />);

      // fireEvent.change sets the value atomically — userEvent.type would
      // exercise per-keystroke onChange, but commit is explicit (Enter/Save).
      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: 'Hold Person' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save spell name' }));

      expect(onPatch).toHaveBeenCalledTimes(1);
      expect(onPatch).toHaveBeenCalledWith({ concentration: { spell: 'Hold Person' } });
    });

    it('never commits on blur — clicking inert content keeps the draft and the Save affordance', () => {
      // Regression (PR #235 review, iteration 3): implicit blur-commits kept
      // spawning event-ordering bugs (swallowed clicks, stale skip flags,
      // stranded drafts). Commits are explicit now; an unsaved draft stays
      // visibly unsaved via the Save button.
      render(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Bless' } })}
          {...editable}
        />
      );

      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: 'Fireball' } });
      // Focus leaves the input for inert card content (heading/whitespace).
      fireEvent.blur(input);

      expect(onPatch).not.toHaveBeenCalled();
      expect(input).toHaveValue('Fireball');
      expect(screen.getByRole('button', { name: 'Save spell name' })).toBeInTheDocument();
    });

    it('hides the Save button while no draft is pending', () => {
      render(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Bless' } })}
          {...editable}
        />
      );
      expect(screen.queryByRole('button', { name: 'Save spell name' })).not.toBeInTheDocument();
    });

    it('clears the draft when a fold-through action finds it equal to the server value', () => {
      // Regression (PR #235 review, iteration 3): the equal-value path left the
      // draft dangling, which could later mask (and stray-commit over) a
      // concurrent rename.
      const { rerender } = render(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Bless' } })}
          {...editable}
        />
      );

      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: 'Bless' } }); // retype server value
      fireEvent.click(screen.getByRole('button', { name: 'Set exhaustion level 2' }));

      expect(onPatch).toHaveBeenCalledTimes(1);
      expect(onPatch).toHaveBeenCalledWith({ exhaustion: 2 }); // no concentration fold

      // A concurrent rename lands: the input must show it, not a stale draft.
      rerender(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Moonbeam' }, version: 2 })}
          {...editable}
        />
      );
      expect(screen.getByLabelText('Concentration spell')).toHaveValue('Moonbeam');
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

    it('folds an uncommitted spell draft into an exhaustion click as one composite patch', () => {
      // Regression (PR #235 review, iteration 2): the blur-commit used to fire
      // its own PATCH first, and isSaving disabled the pip before its click
      // landed — the exhaustion change was silently swallowed.
      render(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Bless' } })}
          {...editable}
        />
      );

      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: 'Fireball' } });
      const pip = screen.getByRole('button', { name: 'Set exhaustion level 3' });
      fireEvent.mouseDown(pip);
      fireEvent.blur(input, { relatedTarget: pip });
      fireEvent.click(pip);

      expect(onPatch).toHaveBeenCalledTimes(1);
      expect(onPatch).toHaveBeenCalledWith({
        concentration: { spell: 'Fireball' },
        exhaustion: 3,
      });
    });

    it('folds an uncommitted spell draft into a condition change as one composite patch', () => {
      render(
        <StatusTracker
          character={makeCharacter({ concentration: {}, conditions: ['Poisoned'] })}
          {...editable}
        />
      );

      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: 'Bless' } });
      const remove = screen.getByRole('button', { name: 'Remove Poisoned' });
      fireEvent.mouseDown(remove);
      fireEvent.blur(input, { relatedTarget: remove });
      fireEvent.click(remove);

      expect(onPatch).toHaveBeenCalledTimes(1);
      expect(onPatch).toHaveBeenCalledWith({
        concentration: { spell: 'Bless' },
        conditions: [],
      });
    });

    it('keyboard: tabbing to Stop concentrating and activating it stops instead of renaming', () => {
      // Regression (PR #235 review, iteration 2): the mousedown-only discard
      // left Tab → Enter committing the draft as a rename and swallowing the
      // stop for keyboard users.
      render(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Bless' } })}
          {...editable}
        />
      );

      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: 'Fireball' } });
      const stop = screen.getByRole('button', { name: 'Stop concentrating' });
      // Tab: blur with focus moving to the button — no mousedown involved.
      fireEvent.blur(input, { relatedTarget: stop });
      fireEvent.click(stop); // keyboard activation dispatches a click

      expect(onPatch).toHaveBeenCalledTimes(1);
      expect(onPatch).toHaveBeenCalledWith({ concentration: null });
    });

    it('keeps the typed draft when a press on Stop is aborted (drag away, no click)', () => {
      // Regression (PR #235 review, iteration 2): the mousedown discard wiped
      // the typed text even when the click never completed.
      render(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Bless' } })}
          {...editable}
        />
      );

      const input = screen.getByLabelText('Concentration spell');
      fireEvent.change(input, { target: { value: 'Polymorph' } });
      const stop = screen.getByRole('button', { name: 'Stop concentrating' });
      fireEvent.mouseDown(stop);
      fireEvent.blur(input, { relatedTarget: stop });
      // No click — the user dragged off the button before releasing.

      expect(onPatch).not.toHaveBeenCalled();
      expect(input).toHaveValue('Polymorph');
    });

    it('retyping the server value after a failed rename restores the server display', () => {
      // Regression (PR #235 review, iteration 2): the unchanged-value early
      // return left pendingSpell set, so the input stayed stuck on the
      // rejected value.
      render(
        <StatusTracker
          character={makeCharacter({ concentration: { spell: 'Bless' } })}
          {...editable}
        />
      );

      const input = screen.getByLabelText('Concentration spell');
      // Commit 'Fire' — the write fails server-side (no refetch, prop unchanged).
      fireEvent.change(input, { target: { value: 'Fire' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onPatch).toHaveBeenCalledTimes(1);

      // User re-enters the server's own value to abandon the rename.
      fireEvent.change(input, { target: { value: 'Bless' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(onPatch).toHaveBeenCalledTimes(1); // no redundant PATCH
      expect(input).toHaveValue('Bless'); // not stuck on 'Fire'
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
      fireEvent.keyDown(input, { key: 'Enter' });

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
