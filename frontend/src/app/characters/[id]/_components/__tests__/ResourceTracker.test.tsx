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
    it('adds a resource with used 0 and clears the form', async () => {
      const user = userEvent.setup();
      render(<ResourceTracker character={makeCharacter({ resources: [ki] })} {...editable} />);
      const name = screen.getByLabelText('New resource name');
      await user.type(name, 'Bardic Inspiration');
      fireEvent.change(screen.getByLabelText('New resource max'), { target: { value: '4' } });
      await user.selectOptions(screen.getByLabelText('New resource recharge'), 'long');
      await user.click(screen.getByRole('button', { name: 'Add resource' }));
      expect(onPatch).toHaveBeenCalledWith({
        resources: [ki, { name: 'Bardic Inspiration', max: 4, used: 0, recharge: 'long' }],
      });
      expect(name).toHaveValue('');
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

    it('closes an open editor when any row is removed (indexes shift under it)', async () => {
      // With the editor keyed by index, removing a row above it would leave
      // Save silently overwriting a different resource once the list refetches.
      const user = userEvent.setup();
      render(
        <ResourceTracker character={makeCharacter({ resources: [ki, rage] })} {...editable} />
      );
      await user.click(screen.getByLabelText('Edit Rage'));
      expect(screen.getByLabelText('Edit resource name')).toBeInTheDocument();
      await user.click(screen.getByLabelText('Remove Ki Points'));
      expect(onPatch).toHaveBeenCalledWith({ resources: [rage] });
      expect(screen.queryByLabelText('Edit resource name')).not.toBeInTheDocument();
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
