import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PrintToggle from '../PrintToggle';
import { PrintTrayProvider, usePrintTray } from '@/lib/print-tray-context';

/** Exposes tray state alongside the toggle under test. */
function TrayProbe() {
  const tray = usePrintTray();
  return (
    <div>
      <span data-testid="count">{tray.count}</span>
      <span data-testid="items">{JSON.stringify(tray.items)}</span>
    </div>
  );
}

function renderToggle(ui: React.ReactNode) {
  return render(
    <PrintTrayProvider>
      {ui}
      <TrayProbe />
    </PrintTrayProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('PrintToggle', () => {
  describe('icon variant (default)', () => {
    it('renders unselected with an "Add … to print set" label and aria-pressed=false', () => {
      renderToggle(<PrintToggle type="monster" id="goblin" name="Goblin" />);

      const button = screen.getByRole('button', { name: 'Add Goblin to print set' });
      expect(button).toHaveAttribute('aria-pressed', 'false');
    });

    it('click adds the item to the tray and flips to selected state', async () => {
      const user = userEvent.setup();
      renderToggle(<PrintToggle type="monster" id="goblin" name="Goblin" />);

      await user.click(screen.getByRole('button', { name: 'Add Goblin to print set' }));

      expect(screen.getByTestId('count')).toHaveTextContent('1');
      expect(screen.getByTestId('items')).toHaveTextContent(
        JSON.stringify([{ type: 'monster', id: 'goblin' }])
      );
      const button = screen.getByRole('button', { name: 'Remove Goblin from print set' });
      expect(button).toHaveAttribute('aria-pressed', 'true');
    });

    it('second click removes the item again', async () => {
      const user = userEvent.setup();
      renderToggle(<PrintToggle type="spell" id="fireball" name="Fireball" />);

      await user.click(screen.getByRole('button', { name: 'Add Fireball to print set' }));
      await user.click(screen.getByRole('button', { name: 'Remove Fireball from print set' }));

      expect(screen.getByTestId('count')).toHaveTextContent('0');
      expect(screen.getByRole('button', { name: 'Add Fireball to print set' })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });

    it('reflects membership seeded from elsewhere (same provider)', async () => {
      const user = userEvent.setup();
      renderToggle(
        <>
          <PrintToggle type="feature" id="action-surge" name="Action Surge" />
          <PrintToggle type="feature" id="action-surge" name="Action Surge (chip)" />
        </>
      );

      await user.click(screen.getByRole('button', { name: 'Add Action Surge to print set' }));

      // Both toggles for the same (type, id) show selected.
      expect(
        screen.getByRole('button', { name: 'Remove Action Surge (chip) from print set' })
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('does not trigger a parent onClick (stopPropagation)', async () => {
      const parentClick = vi.fn();
      const user = userEvent.setup();
      renderToggle(
        <div onClick={parentClick}>
          <PrintToggle type="item" id="rope" name="Rope" />
        </div>
      );

      await user.click(screen.getByRole('button', { name: 'Add Rope to print set' }));

      expect(parentClick).not.toHaveBeenCalled();
      expect(screen.getByTestId('count')).toHaveTextContent('1');
    });
  });

  describe('chip variant', () => {
    it('renders the name as visible chip text with the same accessible label', async () => {
      const user = userEvent.setup();
      renderToggle(<PrintToggle type="feature" id="cf-1" name="Action Surge" variant="chip" />);

      const chip = screen.getByRole('button', { name: 'Add Action Surge to print set' });
      expect(chip).toHaveTextContent('Action Surge');
      expect(chip).toHaveAttribute('aria-pressed', 'false');

      await user.click(chip);

      expect(screen.getByTestId('items')).toHaveTextContent(
        JSON.stringify([{ type: 'feature', id: 'cf-1' }])
      );
      expect(
        screen.getByRole('button', { name: 'Remove Action Surge from print set' })
      ).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('button variant', () => {
    it('renders visible "Add to print set" text, then "Remove from print set" when selected', async () => {
      const user = userEvent.setup();
      renderToggle(<PrintToggle type="monster" id="goblin" name="Goblin" variant="button" />);

      const button = screen.getByRole('button', { name: 'Add Goblin to print set' });
      expect(button).toHaveTextContent('Add to print set');

      await user.click(button);

      expect(
        screen.getByRole('button', { name: 'Remove Goblin from print set' })
      ).toHaveTextContent('Remove from print set');
    });
  });
});
