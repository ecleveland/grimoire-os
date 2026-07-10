import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResourceTracker from '../ResourceTracker';
import type { Character, CharacterResource } from '@/lib/types';
import { makeCharacter as makeBaseCharacter } from '@/test-utils/character';

const ki: CharacterResource = { name: 'Ki Points', max: 5, used: 2, recharge: 'short' };
const rage: CharacterResource = { name: 'Rage', max: 3, used: 0, recharge: 'long' };
const sorcery: CharacterResource = { name: 'Sorcery Points', max: 20, used: 4, recharge: 'long' };

function makeCharacter(over: Partial<Character> = {}): Character {
  return makeBaseCharacter({ resources: [ki, rage], ...over });
}

const onPatch = vi.fn();
const editable = { editable: true as const, onPatch, isSaving: false };

beforeEach(() => {
  onPatch.mockReset();
});

describe('ResourceTracker', () => {
  describe('rendering', () => {
    it('renders a row per resource with name and recharge kind', () => {
      render(<ResourceTracker character={makeCharacter()} {...editable} />);
      expect(screen.getByText('Ki Points')).toBeInTheDocument();
      expect(screen.getByText('Rage')).toBeInTheDocument();
      expect(screen.getByTestId('resource-0-recharge')).toHaveTextContent('Short rest');
      expect(screen.getByTestId('resource-1-recharge')).toHaveTextContent('Long rest');
    });

    it('tolerates null resources (legacy row) without crashing, showing the empty state to the owner', () => {
      render(<ResourceTracker character={makeCharacter({ resources: null })} {...editable} />);
      expect(screen.getByText('Resources')).toBeInTheDocument();
      expect(screen.getByText('No resources tracked')).toBeInTheDocument();
    });

    it('renders nothing at all for a read-only viewer with no resources', () => {
      const { container } = render(
        <ResourceTracker character={makeCharacter({ resources: null })} />
      );
      expect(container).toBeEmptyDOMElement();
    });

    it('renders a pip track for a small pool (max ≤ 10), filled per use consumed', () => {
      render(<ResourceTracker character={makeCharacter({ resources: [ki] })} {...editable} />);
      const pips = screen.getAllByTestId(/resource-0-pip-/);
      expect(pips).toHaveLength(5);
      expect(pips.filter(p => p.dataset.filled === 'true')).toHaveLength(2);
    });

    it('renders a counter with remaining/max for a large pool (max > 10)', () => {
      render(<ResourceTracker character={makeCharacter({ resources: [sorcery] })} {...editable} />);
      expect(screen.getByText('16/20')).toBeInTheDocument();
      expect(screen.queryAllByTestId(/resource-0-pip-/)).toHaveLength(0);
    });

    it('switches idiom exactly at the pip limit: max 10 renders pips, max 11 a counter', () => {
      render(
        <ResourceTracker
          character={makeCharacter({
            resources: [
              { ...ki, name: 'At Limit', max: 10 },
              { ...ki, name: 'Over Limit', max: 11 },
            ],
          })}
          {...editable}
        />
      );
      expect(screen.getAllByTestId(/resource-0-pip-/)).toHaveLength(10);
      expect(screen.queryAllByTestId(/resource-1-pip-/)).toHaveLength(0);
      expect(screen.getByLabelText('Spend Over Limit')).toBeInTheDocument();
    });
  });

  describe('spend/restore', () => {
    it('clicking an unfilled pip spends up to and including it', async () => {
      const user = userEvent.setup();
      render(
        <ResourceTracker character={makeCharacter({ resources: [ki, rage] })} {...editable} />
      );
      // used=2; clicking pip 4 (index 3) fills through it → used=4.
      await user.click(screen.getByLabelText('Ki Points use 4'));
      expect(onPatch).toHaveBeenCalledWith({
        resources: [{ ...ki, used: 4 }, rage],
      });
    });

    it('clicking the highest filled pip clears it (togglePip semantics)', async () => {
      const user = userEvent.setup();
      render(<ResourceTracker character={makeCharacter({ resources: [ki] })} {...editable} />);
      await user.click(screen.getByLabelText('Ki Points use 2'));
      expect(onPatch).toHaveBeenCalledWith({ resources: [{ ...ki, used: 1 }] });
    });

    it('counter Spend increments used by one', async () => {
      const user = userEvent.setup();
      render(<ResourceTracker character={makeCharacter({ resources: [sorcery] })} {...editable} />);
      await user.click(screen.getByLabelText('Spend Sorcery Points'));
      expect(onPatch).toHaveBeenCalledWith({ resources: [{ ...sorcery, used: 5 }] });
    });

    it('counter Restore decrements used by one', async () => {
      const user = userEvent.setup();
      render(<ResourceTracker character={makeCharacter({ resources: [sorcery] })} {...editable} />);
      await user.click(screen.getByLabelText('Restore Sorcery Points'));
      expect(onPatch).toHaveBeenCalledWith({ resources: [{ ...sorcery, used: 3 }] });
    });

    it('disables Spend when the pool is exhausted and Restore when untouched', () => {
      render(
        <ResourceTracker
          character={makeCharacter({
            resources: [
              { ...sorcery, name: 'Empty Pool', used: 20 },
              { ...sorcery, name: 'Full Pool', used: 0 },
            ],
          })}
          {...editable}
        />
      );
      expect(screen.getByLabelText('Spend Empty Pool')).toBeDisabled();
      expect(screen.getByLabelText('Restore Full Pool')).toBeDisabled();
    });
  });

  describe('add', () => {
    it('adds a resource with used 0, keeping the form until the write lands in the refetched list', async () => {
      // The PATCH is fire-and-forget: clearing the form immediately would
      // discard the typed draft if the write 409s. The form clears only once
      // the refetched character actually contains the new resource.
      const user = userEvent.setup();
      const added = { name: 'Bardic Inspiration', max: 4, used: 0, recharge: 'long' as const };
      const { rerender } = render(
        <ResourceTracker character={makeCharacter({ resources: [ki] })} {...editable} />
      );
      const name = screen.getByLabelText('New resource name');
      await user.type(name, 'Bardic Inspiration');
      fireEvent.change(screen.getByLabelText('New resource max'), { target: { value: '4' } });
      await user.selectOptions(screen.getByLabelText('New resource recharge'), 'long');
      await user.click(screen.getByRole('button', { name: 'Add resource' }));
      expect(onPatch).toHaveBeenCalledWith({ resources: [ki, added] });
      // Write not yet confirmed: the draft survives (a 409 would need a retry).
      expect(name).toHaveValue('Bardic Inspiration');
      // Refetch lands with the new row → the form resets.
      rerender(
        <ResourceTracker character={makeCharacter({ resources: [ki, added] })} {...editable} />
      );
      expect(screen.getByLabelText('New resource name')).toHaveValue('');
    });

    it('does not wipe a newly typed draft when the pending add lands', async () => {
      // User submits 'Bardic Inspiration', then starts typing the next
      // resource while the write round-trips: the confirmation must only
      // clear the form if it still holds the submitted draft.
      const user = userEvent.setup();
      const added = { name: 'Bardic Inspiration', max: 4, used: 0, recharge: 'short' as const };
      const { rerender } = render(
        <ResourceTracker character={makeCharacter({ resources: [ki] })} {...editable} />
      );
      const name = screen.getByLabelText('New resource name');
      await user.type(name, 'Bardic Inspiration');
      fireEvent.change(screen.getByLabelText('New resource max'), { target: { value: '4' } });
      await user.click(screen.getByRole('button', { name: 'Add resource' }));
      // Next draft typed while the write is in flight.
      fireEvent.change(name, { target: { value: 'Rage' } });
      fireEvent.change(screen.getByLabelText('New resource max'), { target: { value: '3' } });
      rerender(
        <ResourceTracker character={makeCharacter({ resources: [ki, added] })} {...editable} />
      );
      expect(screen.getByLabelText('New resource name')).toHaveValue('Rage');
      expect(screen.getByLabelText('New resource max')).toHaveValue(3);
    });

    it('disables Add for a non-integer max instead of silently flooring it', async () => {
      const user = userEvent.setup();
      render(<ResourceTracker character={makeCharacter()} {...editable} />);
      await user.type(screen.getByLabelText('New resource name'), 'Arrows');
      fireEvent.change(screen.getByLabelText('New resource max'), { target: { value: '7.5' } });
      expect(screen.getByRole('button', { name: 'Add resource' })).toBeDisabled();
    });

    it("defaults a new resource's recharge to short when the select is untouched", async () => {
      const user = userEvent.setup();
      render(<ResourceTracker character={makeCharacter({ resources: [] })} {...editable} />);
      await user.type(screen.getByLabelText('New resource name'), 'Channel Divinity');
      fireEvent.change(screen.getByLabelText('New resource max'), { target: { value: '2' } });
      await user.click(screen.getByRole('button', { name: 'Add resource' }));
      expect(onPatch).toHaveBeenCalledWith({
        resources: [{ name: 'Channel Divinity', max: 2, used: 0, recharge: 'short' }],
      });
    });

    it('disables Add until a name is entered', () => {
      render(<ResourceTracker character={makeCharacter()} {...editable} />);
      expect(screen.getByRole('button', { name: 'Add resource' })).toBeDisabled();
    });

    it('disables Add when max exceeds the backend cap of 99 (typed input bypasses the HTML max attr)', async () => {
      const user = userEvent.setup();
      render(<ResourceTracker character={makeCharacter()} {...editable} />);
      await user.type(screen.getByLabelText('New resource name'), 'Arrows');
      fireEvent.change(screen.getByLabelText('New resource max'), { target: { value: '200' } });
      expect(screen.getByRole('button', { name: 'Add resource' })).toBeDisabled();
    });

    it('disables Add at the 30-resource backend cap', async () => {
      const user = userEvent.setup();
      const full = Array.from({ length: 30 }, (_, i) => ({ ...ki, name: `Pool ${i}` }));
      render(<ResourceTracker character={makeCharacter({ resources: full })} {...editable} />);
      await user.type(screen.getByLabelText('New resource name'), 'One Too Many');
      fireEvent.change(screen.getByLabelText('New resource max'), { target: { value: '3' } });
      expect(screen.getByRole('button', { name: 'Add resource' })).toBeDisabled();
    });
  });

  describe('edit', () => {
    it('saves edited name/max/recharge for the row', async () => {
      const user = userEvent.setup();
      render(
        <ResourceTracker character={makeCharacter({ resources: [ki, rage] })} {...editable} />
      );
      await user.click(screen.getByLabelText('Edit Rage'));
      const nameInput = screen.getByLabelText('Edit resource name');
      fireEvent.change(nameInput, { target: { value: 'Rages' } });
      fireEvent.change(screen.getByLabelText('Edit resource max'), { target: { value: '4' } });
      await user.selectOptions(screen.getByLabelText('Edit resource recharge'), 'short');
      await user.click(screen.getByRole('button', { name: 'Save resource' }));
      expect(onPatch).toHaveBeenCalledWith({
        resources: [ki, { name: 'Rages', max: 4, used: 0, recharge: 'short' }],
      });
    });

    it('re-clamps used when max shrinks below it', async () => {
      const user = userEvent.setup();
      render(<ResourceTracker character={makeCharacter({ resources: [ki] })} {...editable} />);
      await user.click(screen.getByLabelText('Edit Ki Points'));
      fireEvent.change(screen.getByLabelText('Edit resource max'), { target: { value: '1' } });
      await user.click(screen.getByRole('button', { name: 'Save resource' }));
      expect(onPatch).toHaveBeenCalledWith({
        resources: [{ ...ki, max: 1, used: 1 }],
      });
    });

    it('keeps targeting the edited resource when a row above it disappears via refetch', async () => {
      // A 409-conflict refetch (another tab deleted a row) can shift indexes
      // under an open editor; the editor is keyed by resource identity, not
      // index, so Save must still write to the row the user was editing.
      const user = userEvent.setup();
      const { rerender } = render(
        <ResourceTracker character={makeCharacter({ resources: [ki, rage] })} {...editable} />
      );
      await user.click(screen.getByLabelText('Edit Rage'));
      fireEvent.change(screen.getByLabelText('Edit resource name'), {
        target: { value: 'Rages' },
      });
      // Refetch lands without Ki Points: Rage is now index 0.
      rerender(<ResourceTracker character={makeCharacter({ resources: [rage] })} {...editable} />);
      await user.click(screen.getByRole('button', { name: 'Save resource' }));
      expect(onPatch).toHaveBeenCalledWith({
        resources: [{ ...rage, name: 'Rages' }],
      });
    });

    it('closes the editor when the edited resource no longer exists after a refetch', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <ResourceTracker character={makeCharacter({ resources: [ki, rage] })} {...editable} />
      );
      await user.click(screen.getByLabelText('Edit Rage'));
      rerender(<ResourceTracker character={makeCharacter({ resources: [ki] })} {...editable} />);
      expect(screen.queryByLabelText('Edit resource name')).not.toBeInTheDocument();
    });

    it('cancel closes the editor without patching', async () => {
      const user = userEvent.setup();
      render(<ResourceTracker character={makeCharacter({ resources: [ki] })} {...editable} />);
      await user.click(screen.getByLabelText('Edit Ki Points'));
      await user.click(screen.getByRole('button', { name: 'Cancel edit' }));
      expect(onPatch).not.toHaveBeenCalled();
      expect(screen.queryByLabelText('Edit resource name')).not.toBeInTheDocument();
    });
  });

  describe('remove', () => {
    it('removes the row', async () => {
      const user = userEvent.setup();
      render(
        <ResourceTracker character={makeCharacter({ resources: [ki, rage] })} {...editable} />
      );
      await user.click(screen.getByLabelText('Remove Ki Points'));
      expect(onPatch).toHaveBeenCalledWith({ resources: [rage] });
    });

    it('keeps an open editor tracking its row when a different row is removed', async () => {
      // The editor is identity-keyed, so removing an unrelated row must not
      // discard the in-progress draft; after the refetch shifts indexes the
      // editor still targets (and Save still writes) the row being edited.
      const user = userEvent.setup();
      const { rerender } = render(
        <ResourceTracker character={makeCharacter({ resources: [ki, rage] })} {...editable} />
      );
      await user.click(screen.getByLabelText('Edit Rage'));
      fireEvent.change(screen.getByLabelText('Edit resource name'), {
        target: { value: 'Rages' },
      });
      await user.click(screen.getByLabelText('Remove Ki Points'));
      expect(onPatch).toHaveBeenCalledWith({ resources: [rage] });
      expect(screen.getByLabelText('Edit resource name')).toHaveValue('Rages');
      // Refetch lands without Ki Points; Save writes the edited row at its new index.
      rerender(<ResourceTracker character={makeCharacter({ resources: [rage] })} {...editable} />);
      await user.click(screen.getByRole('button', { name: 'Save resource' }));
      expect(onPatch).toHaveBeenLastCalledWith({ resources: [{ ...rage, name: 'Rages' }] });
    });
  });

  describe('authorization / saving states', () => {
    it('read-only viewers see tracks but no controls', () => {
      render(<ResourceTracker character={makeCharacter({ resources: [ki, sorcery] })} />);
      expect(screen.getByText('Ki Points')).toBeInTheDocument();
      expect(screen.queryByLabelText('Spend Sorcery Points')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Remove Ki Points')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('New resource name')).not.toBeInTheDocument();
      // Pips render as inert spans, not buttons.
      expect(screen.queryByLabelText('Ki Points use 1')).not.toBeInTheDocument();
    });

    it('disables all controls while a write is in flight', () => {
      render(
        <ResourceTracker
          character={makeCharacter({ resources: [ki, sorcery] })}
          editable
          onPatch={onPatch}
          isSaving
        />
      );
      expect(screen.getByLabelText('Ki Points use 1')).toBeDisabled();
      expect(screen.getByLabelText('Spend Sorcery Points')).toBeDisabled();
      expect(screen.getByLabelText('Remove Ki Points')).toBeDisabled();
    });
  });
});
