import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LootItemsEditor from '../LootItemsEditor';
import type { LootTemplateItemEntry } from '@grimoire-os/shared';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

const dagger = { id: 'item-1', name: 'Dagger', category: 'Weapon', isMagic: false };
const quarterstaff = { id: 'item-2', name: 'Quarterstaff', category: 'Weapon', isMagic: false };

function makeResponse(items: object[]) {
  return { data: items, total: items.length, page: 1, lastPage: 1 };
}

const twoEntries: LootTemplateItemEntry[] = [
  { itemName: 'Dagger', weight: 60, qty: [1, 1] },
  { itemName: 'Quarterstaff', weight: 80, qty: [1, 2] },
];

function setup(value: LootTemplateItemEntry[] = []) {
  const onChange = vi.fn();
  render(<LootItemsEditor value={value} onChange={onChange} />);
  return { onChange };
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('LootItemsEditor', () => {
  it('shows an empty state and does not fetch while the search is empty', () => {
    setup();
    expect(screen.getByText(/no items yet/i)).toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('debounces the search input into a GET /srd/items request carrying the query', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([dagger]));
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search items/i), 'dag');

    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find(
        ([path]) => typeof path === 'string' && path.startsWith('/srd/items?')
      );
      expect(call).toBeDefined();
      expect(call![0]).toContain('q=dag');
    });
    // Debounce collapses the keystrokes into a single request.
    expect(
      mockApiFetch.mock.calls.filter(
        ([path]) => typeof path === 'string' && path.startsWith('/srd/items?')
      )
    ).toHaveLength(1);
  });

  it('picking a search result adds an entry with default weight and qty', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([dagger]));
    const user = userEvent.setup();
    const { onChange } = setup();

    await user.type(screen.getByLabelText(/search items/i), 'dag');
    await user.click(await screen.findByRole('button', { name: /add dagger/i }));

    expect(onChange).toHaveBeenCalledWith([{ itemName: 'Dagger', weight: 1, qty: [1, 1] }]);
  });

  it('hides results that are already in the list', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([dagger, quarterstaff]));
    const user = userEvent.setup();
    setup([{ itemName: 'Dagger', weight: 60, qty: [1, 1] }]);

    await user.type(screen.getByLabelText(/search items/i), 'a');

    expect(await screen.findByRole('button', { name: /add quarterstaff/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add dagger/i })).toBeNull();
  });

  it('shows a no-matches message when the search returns nothing', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search items/i), 'zzz');

    expect(await screen.findByText(/no matching items/i)).toBeInTheDocument();
  });

  it('surfaces a toast when the search fails', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search items/i), 'dag');

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to search items'));
  });

  it('renders existing entries with their weight and qty', () => {
    setup(twoEntries);
    expect(screen.getByLabelText('Dagger weight')).toHaveValue(60);
    expect(screen.getByLabelText('Dagger qty min')).toHaveValue(1);
    expect(screen.getByLabelText('Dagger qty max')).toHaveValue(1);
    expect(screen.getByLabelText('Quarterstaff weight')).toHaveValue(80);
  });

  it('editing a weight emits the updated entry and clamps negatives to 0', () => {
    const { onChange } = setup(twoEntries);
    fireEvent.change(screen.getByLabelText('Dagger weight'), { target: { value: '-5' } });
    expect(onChange).toHaveBeenCalledWith([
      { itemName: 'Dagger', weight: 0, qty: [1, 1] },
      { itemName: 'Quarterstaff', weight: 80, qty: [1, 2] },
    ]);
  });

  it('raising qty min above max pulls max up with it', () => {
    const { onChange } = setup(twoEntries);
    fireEvent.change(screen.getByLabelText('Dagger qty min'), { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith([
      { itemName: 'Dagger', weight: 60, qty: [4, 4] },
      { itemName: 'Quarterstaff', weight: 80, qty: [1, 2] },
    ]);
  });

  it('clamps qty below 1 up to 1', () => {
    const { onChange } = setup(twoEntries);
    fireEvent.change(screen.getByLabelText('Quarterstaff qty min'), { target: { value: '0' } });
    expect(onChange).toHaveBeenCalledWith([
      { itemName: 'Dagger', weight: 60, qty: [1, 1] },
      { itemName: 'Quarterstaff', weight: 80, qty: [1, 2] },
    ]);
  });

  it('removes an entry', async () => {
    const user = userEvent.setup();
    const { onChange } = setup(twoEntries);

    await user.click(screen.getByRole('button', { name: /remove dagger/i }));

    expect(onChange).toHaveBeenCalledWith([{ itemName: 'Quarterstaff', weight: 80, qty: [1, 2] }]);
  });
});
