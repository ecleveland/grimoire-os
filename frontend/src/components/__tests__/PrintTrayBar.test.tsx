import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PrintTrayBar from '../PrintTrayBar';
import {
  PrintTrayProvider,
  usePrintTray,
  PRINT_TRAY_SOFT_CAP,
  PRINT_TRAY_STORAGE_KEY,
} from '@/lib/print-tray-context';
import type { PrintTrayItem } from '@/lib/print-tray-context';

/** Buttons to mutate the tray from inside the provider. */
function TrayControls() {
  const tray = usePrintTray();
  return (
    <div>
      <button onClick={() => tray.add('monster', 'goblin')}>Add goblin</button>
      <button onClick={() => tray.add('spell', 'fireball')}>Add fireball</button>
    </div>
  );
}

function renderBar() {
  return render(
    <PrintTrayProvider>
      <PrintTrayBar />
      <TrayControls />
    </PrintTrayProvider>
  );
}

function seedStorage(items: PrintTrayItem[]) {
  localStorage.setItem(PRINT_TRAY_STORAGE_KEY, JSON.stringify(items));
}

beforeEach(() => {
  localStorage.clear();
});

describe('PrintTrayBar', () => {
  it('renders nothing while the tray is empty', () => {
    renderBar();
    expect(screen.queryByRole('link', { name: /print/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /clear/i })).not.toBeInTheDocument();
  });

  it('shows a "Print (N)" link to /srd/print reflecting the live count', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole('button', { name: 'Add goblin' }));
    await user.click(screen.getByRole('button', { name: 'Add fireball' }));

    const link = screen.getByRole('link', { name: 'Print (2)' });
    expect(link).toHaveAttribute('href', '/srd/print');
  });

  it('clear-all empties the tray and hides the bar', async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole('button', { name: 'Add goblin' }));
    expect(screen.getByRole('link', { name: 'Print (1)' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear/i }));

    expect(screen.queryByRole('link', { name: /print/i })).not.toBeInTheDocument();
  });

  it('hides the soft-cap warning at or below the cap', async () => {
    seedStorage(
      Array.from({ length: PRINT_TRAY_SOFT_CAP }, (_, i) => ({
        type: 'spell' as const,
        id: `spell-${i}`,
      }))
    );
    renderBar();

    expect(
      await screen.findByRole('link', { name: `Print (${PRINT_TRAY_SOFT_CAP})` })
    ).toBeInTheDocument();
    expect(screen.queryByText(/large print sets/i)).not.toBeInTheDocument();
  });

  it('surfaces the soft-cap warning when the set grows past the cap', async () => {
    seedStorage(
      Array.from({ length: PRINT_TRAY_SOFT_CAP + 1 }, (_, i) => ({
        type: 'spell' as const,
        id: `spell-${i}`,
      }))
    );
    renderBar();

    expect(
      await screen.findByRole('link', { name: `Print (${PRINT_TRAY_SOFT_CAP + 1})` })
    ).toBeInTheDocument();
    expect(screen.getByText(/large print sets/i)).toBeInTheDocument();
  });
});
