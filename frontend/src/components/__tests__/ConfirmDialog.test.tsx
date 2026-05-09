import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from '../ConfirmDialog';

describe('ConfirmDialog', () => {
  describe('rendering', () => {
    it('does not render when open is false', () => {
      render(
        <ConfirmDialog
          open={false}
          onOpenChange={() => {}}
          title="Delete user?"
          description="This cannot be undone."
          onConfirm={() => {}}
        />
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders title and description when open', () => {
      render(
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="Delete user?"
          description="This cannot be undone."
          onConfirm={() => {}}
        />
      );
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Delete user?')).toBeInTheDocument();
      expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    });

    it('renders default labels when not provided', () => {
      render(
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="Sure?"
          description="really?"
          onConfirm={() => {}}
        />
      );
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('renders custom labels when provided', () => {
      render(
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="Sure?"
          description="?"
          confirmLabel="Yes, do it"
          cancelLabel="Nope"
          onConfirm={() => {}}
        />
      );
      expect(screen.getByRole('button', { name: 'Yes, do it' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Nope' })).toBeInTheDocument();
    });

    it('uses red styling for danger variant confirm button', () => {
      render(
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="Sure?"
          description="?"
          variant="danger"
          onConfirm={() => {}}
        />
      );
      const confirmButton = screen.getByRole('button', { name: 'Delete' });
      expect(confirmButton.className).toMatch(/red/);
    });

    it('uses default (indigo) styling for default variant confirm button', () => {
      render(
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="Sure?"
          description="?"
          variant="default"
          confirmLabel="OK"
          onConfirm={() => {}}
        />
      );
      const confirmButton = screen.getByRole('button', { name: 'OK' });
      expect(confirmButton.className).toMatch(/indigo/);
    });

    it('exposes accessible aria-modal and labelledby', () => {
      render(
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="Delete user?"
          description="warning"
          onConfirm={() => {}}
        />
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      const labelledBy = dialog.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(document.getElementById(labelledBy!)?.textContent).toBe('Delete user?');
    });
  });

  describe('confirm', () => {
    it('calls onConfirm when confirm button is clicked', async () => {
      const onConfirm = vi.fn();
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      render(
        <ConfirmDialog
          open
          onOpenChange={onOpenChange}
          title="Delete?"
          description="?"
          onConfirm={onConfirm}
        />
      );
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('closes dialog after confirm by calling onOpenChange(false)', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      render(
        <ConfirmDialog
          open
          onOpenChange={onOpenChange}
          title="Delete?"
          description="?"
          onConfirm={() => {}}
        />
      );
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('cancel', () => {
    it('does not call onConfirm when cancel is clicked', async () => {
      const onConfirm = vi.fn();
      const user = userEvent.setup();
      render(
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="Delete?"
          description="?"
          onConfirm={onConfirm}
        />
      );
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('calls onOpenChange(false) when cancel is clicked', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      render(
        <ConfirmDialog
          open
          onOpenChange={onOpenChange}
          title="Delete?"
          description="?"
          onConfirm={() => {}}
        />
      );
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('keyboard interactions', () => {
    it('closes on Escape and does not call onConfirm', async () => {
      const onConfirm = vi.fn();
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      render(
        <ConfirmDialog
          open
          onOpenChange={onOpenChange}
          title="Delete?"
          description="?"
          onConfirm={onConfirm}
        />
      );
      await user.keyboard('{Escape}');
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('moves focus into the dialog on open', () => {
      render(
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="Delete?"
          description="?"
          onConfirm={() => {}}
        />
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('traps focus within the dialog when tabbing past the last focusable', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="Delete?"
          description="?"
          onConfirm={() => {}}
        />
      );
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      const confirmButton = screen.getByRole('button', { name: 'Delete' });

      // Focus the last focusable element, then Tab — should wrap to first.
      confirmButton.focus();
      expect(document.activeElement).toBe(confirmButton);
      await user.tab();
      expect(document.activeElement).toBe(cancelButton);
    });

    it('wraps focus backward with Shift+Tab from the first focusable', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmDialog
          open
          onOpenChange={() => {}}
          title="Delete?"
          description="?"
          onConfirm={() => {}}
        />
      );
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      const confirmButton = screen.getByRole('button', { name: 'Delete' });

      cancelButton.focus();
      expect(document.activeElement).toBe(cancelButton);
      await user.tab({ shift: true });
      expect(document.activeElement).toBe(confirmButton);
    });
  });

  describe('overlay click', () => {
    it('closes dialog when overlay is clicked', async () => {
      const onOpenChange = vi.fn();
      const onConfirm = vi.fn();
      const user = userEvent.setup();
      render(
        <ConfirmDialog
          open
          onOpenChange={onOpenChange}
          title="Delete?"
          description="?"
          onConfirm={onConfirm}
        />
      );
      const overlay = screen.getByTestId('confirm-dialog-overlay');
      await user.click(overlay);
      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('does not close when clicking inside the dialog content', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      render(
        <ConfirmDialog
          open
          onOpenChange={onOpenChange}
          title="Delete?"
          description="?"
          onConfirm={() => {}}
        />
      );
      await user.click(screen.getByText('Delete?'));
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });

  describe('focus return', () => {
    it('returns focus to the previously focused element when closed', async () => {
      const Wrapper = () => {
        const [open, setOpen] = require('react').useState(false);
        return (
          <>
            <button onClick={() => setOpen(true)}>Open</button>
            <ConfirmDialog
              open={open}
              onOpenChange={setOpen}
              title="Delete?"
              description="?"
              onConfirm={() => {}}
            />
          </>
        );
      };
      const user = userEvent.setup();
      render(<Wrapper />);
      const trigger = screen.getByRole('button', { name: 'Open' });
      trigger.focus();
      await user.click(trigger);
      // dialog opens — focus moved into it
      expect(document.activeElement).not.toBe(trigger);
      // close via cancel
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(document.activeElement).toBe(trigger);
    });
  });
});
