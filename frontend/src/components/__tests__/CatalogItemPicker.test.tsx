import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { renderWithQueryClient } from '@/test-utils/query';
import CatalogItemPicker from '../CatalogItemPicker';

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

function setup(props: Partial<ComponentProps<typeof CatalogItemPicker>> = {}) {
  const onSelect = vi.fn();
  renderWithQueryClient(<CatalogItemPicker onSelect={onSelect} {...props} />);
  return { onSelect };
}

/** The query string of the one `/srd/items` request, once it has fired. */
async function searchParams(): Promise<URLSearchParams> {
  let url = '';
  await waitFor(() => {
    const call = mockApiFetch.mock.calls.find(
      ([path]) => typeof path === 'string' && path.startsWith('/srd/items?')
    );
    expect(call).toBeDefined();
    url = call![0] as string;
  });
  return new URLSearchParams(url.split('?')[1]);
}

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('CatalogItemPicker', () => {
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

  it('toasts a search failure and clears stale results', async () => {
    const { toast } = await import('sonner');
    mockApiFetch
      .mockResolvedValueOnce(makeResponse([dagger]))
      .mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search the item catalog/i), 'dag');
    await screen.findByRole('button', { name: /add dagger/i });

    await user.type(screen.getByLabelText(/search the item catalog/i), 'ger');
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to search items'));
    expect(screen.queryByRole('button', { name: /add dagger/i })).toBeNull();
  });

  it('a late-resolving stale success response does not clobber newer results', async () => {
    // Each fetch returns a deferred promise we resolve out of order.
    const deferreds: Array<(v: unknown) => void> = [];
    mockApiFetch.mockImplementation(() => new Promise(resolve => deferreds.push(resolve)));
    const user = userEvent.setup();
    setup();
    const input = screen.getByLabelText(/search the item catalog/i);

    // First query fires (still pending).
    await user.type(input, 'dag');
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    // Refine the query → second fetch fires (also pending).
    await user.type(input, 'ger');
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));

    // Resolve the NEWER query first, then the stale older one.
    deferreds[1](makeResponse([quarterstaff]));
    deferreds[0](makeResponse([dagger]));

    // The newer results survive; the stale dagger never appears.
    expect(await screen.findByRole('button', { name: /add quarterstaff/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add dagger/i })).toBeNull();
  });

  it('picking a result hides the list at once', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([dagger, quarterstaff]));
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search the item catalog/i), 'a');
    await user.click(await screen.findByRole('button', { name: /add dagger/i }));

    // The debounced query still holds 'a' here, so only the raw-input gate hides the list.
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByText(/searching/i)).toBeNull();
    expect(screen.queryByText(/no matching items/i)).toBeNull();
  });

  it('falls back to a generic message for non-Error rejections', async () => {
    const { toast } = await import('sonner');
    mockApiFetch.mockRejectedValue('nope');
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search the item catalog/i), 'dag');

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to search items'));
  });

  it('searches every tier the caller can see when no tier is given', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([dagger]));
    const user = userEvent.setup();
    setup();

    await user.type(screen.getByLabelText(/search the item catalog/i), 'dag');

    expect((await searchParams()).has('tier')).toBe(false);
  });

  it('asks for the global tier only when tier="global"', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([dagger]));
    const user = userEvent.setup();
    setup({ tier: 'global' });

    await user.type(screen.getByLabelText(/search the item catalog/i), 'dag');

    const params = await searchParams();
    expect(params.get('tier')).toBe('global');
    expect(params.get('q')).toBe('dag');
  });

  it('leaves out the results that exclude rejects', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([dagger, quarterstaff]));
    const user = userEvent.setup();
    setup({ exclude: item => item.id === dagger.id });

    await user.type(screen.getByLabelText(/search the item catalog/i), 'a');

    expect(await screen.findByRole('button', { name: /add quarterstaff/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add dagger/i })).toBeNull();
  });

  it('shows the no-matches message when exclude rejects every result', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([dagger]));
    const user = userEvent.setup();
    setup({ exclude: () => true });

    await user.type(screen.getByLabelText(/search the item catalog/i), 'dag');

    expect(await screen.findByText(/no matching items/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add dagger/i })).toBeNull();
  });

  it('names the input with inputLabel when given', () => {
    setup({ inputLabel: 'Search items' });
    expect(screen.getByRole('textbox', { name: 'Search items' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/search the item catalog/i)).toBeNull();
  });

  it('disables the input when disabled', () => {
    const onSelect = vi.fn();
    renderWithQueryClient(<CatalogItemPicker onSelect={onSelect} disabled />);
    expect(screen.getByLabelText(/search the item catalog/i)).toBeDisabled();
  });
});
