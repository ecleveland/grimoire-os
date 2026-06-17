import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SrdItemSearch from '../SrdItemSearch';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

const dagger = { id: 'item-1', name: 'Dagger', category: 'Weapon', weight: 1 };
const quarterstaff = { id: 'item-2', name: 'Quarterstaff', category: 'Weapon', weight: 4 };

function makeResponse(items: object[]) {
  return { data: items, total: items.length, page: 1, lastPage: 1 };
}

function setup() {
  const onSelect = vi.fn();
  render(<SrdItemSearch onSelect={onSelect} />);
  return { onSelect };
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('SrdItemSearch', () => {
  it('does not fetch while the input is empty', () => {
    setup();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('debounces the input into a single GET /srd/items request carrying the query', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([dagger]));
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search the item catalog/i), 'dag');

    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find(
        ([path]) => typeof path === 'string' && path.startsWith('/srd/items?')
      );
      expect(call).toBeDefined();
      expect(call![0]).toContain('q=dag');
    });
    expect(
      mockApiFetch.mock.calls.filter(
        ([path]) => typeof path === 'string' && path.startsWith('/srd/items?')
      )
    ).toHaveLength(1);
  });

  it('fires onSelect with the chosen catalog item and clears the search', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([dagger, quarterstaff]));
    const user = userEvent.setup();
    const { onSelect } = setup();

    await user.type(screen.getByLabelText(/search the item catalog/i), 'a');
    await user.click(await screen.findByRole('button', { name: /add dagger/i }));

    expect(onSelect).toHaveBeenCalledWith(dagger);
    // Search input and results clear after a pick.
    expect(screen.getByLabelText(/search the item catalog/i)).toHaveValue('');
    expect(screen.queryByRole('button', { name: /add quarterstaff/i })).toBeNull();
  });

  it('shows a no-matches message when the search returns nothing', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search the item catalog/i), 'zzz');

    expect(await screen.findByText(/no matching items/i)).toBeInTheDocument();
  });

  it('surfaces the server error message and clears stale results on failure', async () => {
    const { toast } = await import('sonner');
    mockApiFetch
      .mockResolvedValueOnce(makeResponse([dagger]))
      .mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search the item catalog/i), 'dag');
    await screen.findByRole('button', { name: /add dagger/i });

    await user.type(screen.getByLabelText(/search the item catalog/i), 'ger');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('boom'));
    expect(screen.queryByRole('button', { name: /add dagger/i })).toBeNull();
  });

  it('disables the input when disabled', () => {
    const onSelect = vi.fn();
    render(<SrdItemSearch onSelect={onSelect} disabled />);
    expect(screen.getByLabelText(/search the item catalog/i)).toBeDisabled();
  });
});
