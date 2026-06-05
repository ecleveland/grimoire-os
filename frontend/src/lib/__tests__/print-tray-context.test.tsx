import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  PrintTrayProvider,
  usePrintTray,
  PRINT_TRAY_SOFT_CAP,
  PRINT_TRAY_STORAGE_KEY,
} from '../print-tray-context';
import type { PrintTrayItem } from '../print-tray-context';

function TestConsumer() {
  const tray = usePrintTray();
  return (
    <div>
      <span data-testid="count">{tray.count}</span>
      <span data-testid="over-cap">{String(tray.isOverSoftCap)}</span>
      <span data-testid="has-goblin">{String(tray.has('monster', 'goblin'))}</span>
      <span data-testid="grouped">{JSON.stringify(tray.grouped)}</span>
      <span data-testid="items">{JSON.stringify(tray.items)}</span>
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
