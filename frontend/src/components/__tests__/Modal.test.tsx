import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import Modal from '../Modal';

describe('Modal', () => {
  describe('rendering', () => {
    it('does not render when open is false', () => {
      render(
        <Modal open={false} onClose={() => {}} label="Goblin">
          <p>body</p>
        </Modal>
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders children when open', () => {
      render(
        <Modal open onClose={() => {}} label="Goblin">
          <p>stat block body</p>
        </Modal>
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('stat block body')).toBeInTheDocument();
    });

    it('exposes accessible aria-modal and aria-label', () => {
      render(
        <Modal open onClose={() => {}} label="Goblin">
          <p>body</p>
        </Modal>
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', 'Goblin');
    });

    it('renders a close button', () => {
      render(
        <Modal open onClose={() => {}} label="Goblin">
          <p>body</p>
        </Modal>
      );
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    });
  });

  describe('close interactions', () => {
    it('calls onClose when the close button is clicked', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(
        <Modal open onClose={onClose} label="Goblin">
          <p>body</p>
        </Modal>
      );
      await user.click(screen.getByRole('button', { name: /close/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes on Escape', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(
        <Modal open onClose={onClose} label="Goblin">
          <p>body</p>
        </Modal>
      );
      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('closes when the overlay is clicked', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(
        <Modal open onClose={onClose} label="Goblin">
          <p>body</p>
        </Modal>
      );
      await user.click(screen.getByTestId('modal-overlay'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does not close when clicking inside the dialog content', async () => {
      const onClose = vi.fn();
      const user = userEvent.setup();
      render(
        <Modal open onClose={onClose} label="Goblin">
          <p>inside content</p>
        </Modal>
      );
      await user.click(screen.getByText('inside content'));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('focus management', () => {
    it('moves focus into the dialog on open', () => {
      render(
        <Modal open onClose={() => {}} label="Goblin">
          <button>inside</button>
        </Modal>
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('returns focus to the trigger when closed', async () => {
      const Wrapper = () => {
        const [open, setOpen] = useState(false);
        return (
          <>
            <button onClick={() => setOpen(true)}>Open</button>
            <Modal open={open} onClose={() => setOpen(false)} label="Goblin">
              <p>body</p>
            </Modal>
          </>
        );
      };
      const user = userEvent.setup();
      render(<Wrapper />);
      const trigger = screen.getByRole('button', { name: 'Open' });
      trigger.focus();
      await user.click(trigger);
      expect(document.activeElement).not.toBe(trigger);
      await user.keyboard('{Escape}');
      expect(document.activeElement).toBe(trigger);
    });
  });
});
