import { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import {
  PrintTrayProvider,
  usePrintTray,
  PRINT_TRAY_SOFT_CAP,
  PRINT_TRAY_STORAGE_KEY,
} from '../print-tray-context';
import type { PrintTrayItem } from '../print-tray-context';

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

function TestConsumer() {
  const tray = usePrintTray();
  return (
    <div>
      <span data-testid="count">{tray.count}</span>
      <span data-testid="over-cap">{String(tray.isOverSoftCap)}</span>
      <span data-testid="has-goblin">{String(tray.has('monster', 'goblin'))}</span>
      <span data-testid="grouped">{JSON.stringify(tray.grouped)}</span>
      <span data-testid="items">{JSON.stringify(tray.items)}</span>
      <span data-testid="hydrated">{String(tray.hydrated)}</span>
      <button onClick={() => tray.add('monster', 'goblin')}>Add goblin</button>
      <button onClick={() => tray.add('spell', 'fireball')}>Add fireball</button>
      <button onClick={() => tray.add('feature', 'action-surge')}>Add feature</button>
      <button onClick={() => tray.remove('monster', 'goblin')}>Remove goblin</button>
      <button onClick={() => tray.toggle('monster', 'goblin')}>Toggle goblin</button>
      <button onClick={() => tray.clear()}>Clear</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <PrintTrayProvider>
      <TestConsumer />
    </PrintTrayProvider>
  );
}

function seedStorage(items: PrintTrayItem[]) {
  localStorage.setItem(PRINT_TRAY_STORAGE_KEY, JSON.stringify(items));
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(toast.error).mockClear();
});

describe('usePrintTray outside provider', () => {
  it('throws "usePrintTray must be used within a PrintTrayProvider"', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      'usePrintTray must be used within a PrintTrayProvider'
    );
    spy.mockRestore();
  });
});

describe('PrintTrayProvider', () => {
  it('starts empty', () => {
    renderWithProvider();
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(screen.getByTestId('has-goblin')).toHaveTextContent('false');
    expect(screen.getByTestId('over-cap')).toHaveTextContent('false');
  });

  it('add updates count, has, and items', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole('button', { name: 'Add goblin' }));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('has-goblin')).toHaveTextContent('true');
    expect(screen.getByTestId('items')).toHaveTextContent(
      JSON.stringify([{ type: 'monster', id: 'goblin' }])
    );
  });

  it('de-dupes by (type, id) on repeated add', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole('button', { name: 'Add goblin' }));
    await user.click(screen.getByRole('button', { name: 'Add goblin' }));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('allows mixed types in one set, including feature', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole('button', { name: 'Add goblin' }));
    await user.click(screen.getByRole('button', { name: 'Add fireball' }));
    await user.click(screen.getByRole('button', { name: 'Add feature' }));

    expect(screen.getByTestId('count')).toHaveTextContent('3');
    expect(screen.getByTestId('items')).toHaveTextContent(
      JSON.stringify([
        { type: 'monster', id: 'goblin' },
        { type: 'spell', id: 'fireball' },
        { type: 'feature', id: 'action-surge' },
      ])
    );
  });

  it('remove deletes only the matching pair', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole('button', { name: 'Add goblin' }));
    await user.click(screen.getByRole('button', { name: 'Add fireball' }));
    await user.click(screen.getByRole('button', { name: 'Remove goblin' }));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('has-goblin')).toHaveTextContent('false');
    expect(screen.getByTestId('items')).toHaveTextContent(
      JSON.stringify([{ type: 'spell', id: 'fireball' }])
    );
  });

  it('remove of an absent pair is a no-op', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole('button', { name: 'Add fireball' }));
    await user.click(screen.getByRole('button', { name: 'Remove goblin' }));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('toggle adds when absent and removes when present', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole('button', { name: 'Toggle goblin' }));
    expect(screen.getByTestId('has-goblin')).toHaveTextContent('true');

    await user.click(screen.getByRole('button', { name: 'Toggle goblin' }));
    expect(screen.getByTestId('has-goblin')).toHaveTextContent('false');
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('clear empties the set', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole('button', { name: 'Add goblin' }));
    await user.click(screen.getByRole('button', { name: 'Add fireball' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(screen.getByTestId('items')).toHaveTextContent('[]');
  });

  it('groups the selection by type for the print route, preserving insertion order', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole('button', { name: 'Add goblin' }));
    await user.click(screen.getByRole('button', { name: 'Add fireball' }));
    await user.click(screen.getByRole('button', { name: 'Add feature' }));

    expect(screen.getByTestId('grouped')).toHaveTextContent(
      JSON.stringify([
        { type: 'monster', ids: ['goblin'] },
        { type: 'spell', ids: ['fireball'] },
        { type: 'feature', ids: ['action-surge'] },
      ])
    );
  });
});

describe('persistence', () => {
  it('writes the set to localStorage on change', async () => {
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole('button', { name: 'Add goblin' }));

    expect(JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY)!)).toEqual([
      { type: 'monster', id: 'goblin' },
    ]);
  });

  it('hydrates from localStorage on mount (round-trip across remounts)', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProvider();

    await user.click(screen.getByRole('button', { name: 'Add goblin' }));
    await user.click(screen.getByRole('button', { name: 'Add fireball' }));
    unmount();

    renderWithProvider();
    expect(screen.getByTestId('count')).toHaveTextContent('2');
    expect(screen.getByTestId('has-goblin')).toHaveTextContent('true');
  });

  it('survives a StrictMode mount without clobbering the stored set (VEG-265 regression)', async () => {
    // Next.js dev runs React StrictMode, which double-invokes mount effects.
    // The persist effect must not fire during the mount commit (items still
    // []) or the second hydrate pass reads an already-clobbered store and the
    // set is wiped on every page load.
    seedStorage([
      { type: 'monster', id: 'goblin' },
      { type: 'spell', id: 'fireball' },
    ]);

    render(
      <StrictMode>
        <PrintTrayProvider>
          <TestConsumer />
        </PrintTrayProvider>
      </StrictMode>
    );

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('2'));
    expect(JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY)!)).toEqual([
      { type: 'monster', id: 'goblin' },
      { type: 'spell', id: 'fireball' },
    ]);
  });

  it('flips hydrated to true once the stored set has been read (VEG-268)', async () => {
    // The /srd/print route gates on this: until hydration has run, an empty
    // items array means "don't know yet", not "the set is empty".
    seedStorage([{ type: 'monster', id: 'goblin' }]);

    renderWithProvider();

    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    expect(screen.getByTestId('count')).toHaveTextContent('1');
  });

  it('persists clear so an emptied set stays empty after remount', async () => {
    const user = userEvent.setup();
    const { unmount } = renderWithProvider();

    await user.click(screen.getByRole('button', { name: 'Add goblin' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    unmount();

    renderWithProvider();
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('ignores corrupt JSON in storage', () => {
    localStorage.setItem(PRINT_TRAY_STORAGE_KEY, 'not-json{');
    renderWithProvider();
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('drops entries with unknown types or malformed shapes, keeping valid ones', () => {
    localStorage.setItem(
      PRINT_TRAY_STORAGE_KEY,
      JSON.stringify([
        { type: 'monster', id: 'goblin' },
        { type: 'bogus', id: 'x' },
        { type: 'spell' },
        { id: 'orphan' },
        'garbage',
        { type: 'spell', id: 42 },
      ])
    );
    renderWithProvider();
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('has-goblin')).toHaveTextContent('true');
  });

  it('ignores a non-array JSON payload in storage', () => {
    localStorage.setItem(PRINT_TRAY_STORAGE_KEY, JSON.stringify({ type: 'monster', id: 'g' }));
    renderWithProvider();
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });
});

describe('storage failure visibility', () => {
  // The three storage failure modes (write throws, read throws, corrupt
  // entries dropped) must not be silent: a failed hydration is otherwise
  // pixel-identical to an empty tray, and a failed persist silently turns the
  // selection session-only (PR #121 review).

  it('keeps the in-memory tray working and warns once when persisting throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole('button', { name: 'Add goblin' }));
    await user.click(screen.getByRole('button', { name: 'Add fireball' }));

    // In-memory set still works.
    expect(screen.getByTestId('count')).toHaveTextContent('2');
    // The failure is logged and surfaced to the user once, not per change.
    expect(consoleSpy).toHaveBeenCalledWith('Failed to persist print tray:', expect.any(Error));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/print selection/i),
      expect.objectContaining({ id: 'print-tray-persist' })
    );

    setItemSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('logs when reading the stored set throws', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const getItemSpy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    renderWithProvider();

    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to read print tray from storage:',
      expect.any(Error)
    );

    getItemSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('logs how many malformed stored entries were dropped', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(
      PRINT_TRAY_STORAGE_KEY,
      JSON.stringify([{ type: 'monster', id: 'goblin' }, { type: 'bogus', id: 'x' }, 'garbage'])
    );
    renderWithProvider();

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(consoleSpy).toHaveBeenCalledWith('Print tray: dropped 2 malformed stored entries.');

    consoleSpy.mockRestore();
  });

  it('does not log for a legitimately empty or absent store', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderWithProvider();

    expect(screen.getByTestId('count')).toHaveTextContent('0');
    expect(consoleSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

describe('soft cap', () => {
  it('is not over the cap at exactly the soft cap', () => {
    seedStorage(
      Array.from({ length: PRINT_TRAY_SOFT_CAP }, (_, i) => ({
        type: 'monster' as const,
        id: `m-${i}`,
      }))
    );
    renderWithProvider();
    expect(screen.getByTestId('count')).toHaveTextContent(String(PRINT_TRAY_SOFT_CAP));
    expect(screen.getByTestId('over-cap')).toHaveTextContent('false');
  });

  it('flags isOverSoftCap above the cap but still allows adds', async () => {
    seedStorage(
      Array.from({ length: PRINT_TRAY_SOFT_CAP }, (_, i) => ({
        type: 'monster' as const,
        id: `m-${i}`,
      }))
    );
    const user = userEvent.setup();
    renderWithProvider();

    await user.click(screen.getByRole('button', { name: 'Add fireball' }));

    expect(screen.getByTestId('count')).toHaveTextContent(String(PRINT_TRAY_SOFT_CAP + 1));
    expect(screen.getByTestId('over-cap')).toHaveTextContent('true');
  });
});
