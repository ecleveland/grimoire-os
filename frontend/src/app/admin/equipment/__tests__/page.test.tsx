import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQueryClient } from '@/test-utils/query';
import AdminEquipmentPage from '../page';
import type { SrdItem } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockReplace = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
const stableRouter = { replace: (...args: unknown[]) => mockReplace(...args) };
vi.mock('next/navigation', () => ({
  useRouter: () => stableRouter,
  usePathname: () => '/admin/equipment',
}));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

function makeItem(over: Partial<SrdItem> = {}): SrdItem {
  return {
    id: 'item-1',
    name: "Explorer's Pack",
    category: 'Equipment Pack',
    cost: '10 gp',
    properties: [],
    source: 'Shared',
    contentSource: 'shared',
    ...over,
  } as SrdItem;
}

function paginated(items: SrdItem[], total = items.length) {
  return { data: items, total, page: 1, lastPage: 1 };
}

/** Path-aware default: list reads return the given items; everything else resolves empty. */
function wireApi(items: SrdItem[], detail?: Partial<SrdItem>) {
  mockApiFetch.mockImplementation((path: string) => {
    if (path.startsWith('/admin/items?')) return Promise.resolve(paginated(items));
    if (path.startsWith('/srd/items/')) {
      return Promise.resolve({ ...items[0], ...detail });
    }
    return Promise.resolve(undefined);
  });
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockReplace.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockUseAuth.mockReturnValue({ isAdmin: true });
});

describe('AdminEquipmentPage', () => {
  it('redirects non-admins and renders nothing', async () => {
    mockUseAuth.mockReturnValue({ isAdmin: false });
    const { container } = renderWithQueryClient(<AdminEquipmentPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(container.querySelector('table')).not.toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('waits for auth hydration before redirecting', async () => {
    mockUseAuth.mockReturnValue({ isAdmin: false, isLoading: true });
    renderWithQueryClient(<AdminEquipmentPage />);
    await Promise.resolve();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('loads the shared-item list on mount', async () => {
    wireApi([makeItem(), makeItem({ id: 'item-2', name: 'Riding Horse', category: 'Mount' })]);
    renderWithQueryClient(<AdminEquipmentPage />);
    expect(await screen.findByText("Explorer's Pack")).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith('/admin/items?limit=20&page=1');
    expect(screen.getByText('Riding Horse')).toBeInTheDocument();
  });

  it('shows the empty state when there are no shared items', async () => {
    wireApi([]);
    renderWithQueryClient(<AdminEquipmentPage />);
    expect(await screen.findByText(/no shared items yet/i)).toBeInTheDocument();
  });

  it('toasts when the list fails to load', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    renderWithQueryClient(<AdminEquipmentPage />);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to load items'));
  });

  it('filtering by category refetches with the category param', async () => {
    wireApi([makeItem()]);
    const user = userEvent.setup();
    renderWithQueryClient(<AdminEquipmentPage />);
    await screen.findByText("Explorer's Pack");

    await user.selectOptions(screen.getByLabelText(/filter by category/i), 'Mount');

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/items?category=Mount&limit=20&page=1')
    );
  });

  it('searching refetches with the debounced q param', async () => {
    wireApi([makeItem()]);
    const user = userEvent.setup();
    renderWithQueryClient(<AdminEquipmentPage />);
    await screen.findByText("Explorer's Pack");

    await user.type(screen.getByLabelText(/search items/i), 'pack');

    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find(
        ([p]) => typeof p === 'string' && p.includes('q=pack')
      );
      expect(call).toBeDefined();
    });
  });

  it('creates an item via the form and POSTs the payload', async () => {
    wireApi([]);
    const user = userEvent.setup();
    renderWithQueryClient(<AdminEquipmentPage />);
    await screen.findByText(/no shared items yet/i);

    await user.click(screen.getByRole('button', { name: /new item/i }));
    await user.type(screen.getByLabelText(/^name/i), 'Riding Camel');
    await user.selectOptions(screen.getByLabelText(/^category/i), 'Mount');
    await user.click(screen.getByRole('button', { name: /create item/i }));

    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find(
        ([p, opts]) => p === '/admin/items' && (opts as RequestInit)?.method === 'POST'
      );
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body).toMatchObject({ name: 'Riding Camel', category: 'Mount' });
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Item created');
  });

  it('toasts the server message when create fails', async () => {
    mockApiFetch.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === '/admin/items' && opts?.method === 'POST') {
        return Promise.reject(new Error('A shared item with this name already exists'));
      }
      if (path.startsWith('/admin/items?')) return Promise.resolve(paginated([]));
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    renderWithQueryClient(<AdminEquipmentPage />);
    await screen.findByText(/no shared items yet/i);

    await user.click(screen.getByRole('button', { name: /new item/i }));
    await user.type(screen.getByLabelText(/^name/i), 'Dup');
    await user.selectOptions(screen.getByLabelText(/^category/i), 'Mount');
    await user.click(screen.getByRole('button', { name: /create item/i }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('A shared item with this name already exists')
    );
  });

  it('edits an item via the prefilled form and PATCHes', async () => {
    wireApi([makeItem({ name: 'Riding Horse', category: 'Mount' })]);
    const user = userEvent.setup();
    renderWithQueryClient(<AdminEquipmentPage />);
    await screen.findByText('Riding Horse');

    await user.click(screen.getByRole('button', { name: /edit/i }));
    const nameInput = screen.getByLabelText(/^name/i);
    expect(nameInput).toHaveValue('Riding Horse');
    await user.clear(nameInput);
    await user.type(nameInput, 'Warhorse');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find(
        ([p, opts]) => p === '/admin/items/item-1' && (opts as RequestInit)?.method === 'PATCH'
      );
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body.name).toBe('Warhorse');
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Item updated');
  });

  it('deletes an item after confirmation and refetches the list', async () => {
    // Stateful: the post-delete refetch must reflect the removal, so the GET
    // returns an empty list once the DELETE has run.
    let deleted = false;
    mockApiFetch.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === '/admin/items/item-1' && opts?.method === 'DELETE') {
        deleted = true;
        return Promise.resolve(undefined);
      }
      if (path.startsWith('/admin/items?')) {
        return Promise.resolve(
          paginated(deleted ? [] : [makeItem({ category: 'Mount', name: 'Riding Horse' })])
        );
      }
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    renderWithQueryClient(<AdminEquipmentPage />);
    await screen.findByText('Riding Horse');

    await user.click(screen.getByRole('button', { name: /delete/i }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /delete/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/items/item-1', { method: 'DELETE' })
    );
    expect(mockToastSuccess).toHaveBeenCalledWith('Item deleted');
    // The list re-fetched and the row is gone (not just optimistically hidden).
    await waitFor(() => expect(screen.queryByText('Riding Horse')).not.toBeInTheDocument());
    expect(mockApiFetch).toHaveBeenCalledWith('/admin/items?limit=20&page=1');
  });

  it('steps back a page when deleting the last row on a non-first page', async () => {
    // Page 2 holds a single row; deleting it must not strand the admin on an
    // empty page — the page steps back to 1 and refetches.
    mockApiFetch.mockImplementation((path: string, opts?: RequestInit) => {
      if (opts?.method === 'DELETE') return Promise.resolve(undefined);
      if (path.includes('page=2')) {
        return Promise.resolve({
          data: [makeItem({ id: 'item-2', name: 'Lone Mount', category: 'Mount' })],
          total: 21,
          page: 2,
          lastPage: 2,
        });
      }
      if (path.startsWith('/admin/items?')) {
        return Promise.resolve({
          data: [makeItem({ name: 'First Mount', category: 'Mount' })],
          total: 21,
          page: 1,
          lastPage: 2,
        });
      }
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    renderWithQueryClient(<AdminEquipmentPage />);
    await screen.findByText('First Mount');

    // Go to page 2 (its single row), then delete it.
    await user.click(screen.getByRole('button', { name: /next/i }));
    await screen.findByText('Lone Mount');
    await user.click(screen.getByRole('button', { name: /delete/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /delete/i }));

    // Stepped back to page 1 and refetched, rather than showing an empty page 2.
    await waitFor(() => expect(screen.getByText('First Mount')).toBeInTheDocument());
    expect(screen.queryByText('Lone Mount')).not.toBeInTheDocument();
  });

  it('only shows the Contents action for equipment packs', async () => {
    wireApi([
      makeItem({ id: 'item-1', name: "Explorer's Pack", category: 'Equipment Pack' }),
      makeItem({ id: 'item-2', name: 'Riding Horse', category: 'Mount' }),
    ]);
    renderWithQueryClient(<AdminEquipmentPage />);
    await screen.findByText("Explorer's Pack");

    const packRow = screen.getByText("Explorer's Pack").closest('tr')!;
    const mountRow = screen.getByText('Riding Horse').closest('tr')!;
    expect(within(packRow).getByRole('button', { name: /contents/i })).toBeInTheDocument();
    expect(within(mountRow).queryByRole('button', { name: /contents/i })).toBeNull();
  });

  it('opens the contents editor, loads resolved contents, and PUTs the saved set', async () => {
    wireApi([makeItem({ id: 'pack-1', name: "Explorer's Pack", category: 'Equipment Pack' })], {
      id: 'pack-1',
      contents: [{ itemId: 'c1', name: 'Bedroll', quantity: 1 }],
    });
    const user = userEvent.setup();
    renderWithQueryClient(<AdminEquipmentPage />);
    await screen.findByText("Explorer's Pack");

    await user.click(screen.getByRole('button', { name: /contents/i }));

    // Loaded the existing entry via the detail endpoint.
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/srd/items/pack-1'));
    expect(await screen.findByLabelText('Bedroll quantity')).toHaveValue(1);

    await user.click(screen.getByRole('button', { name: /save contents/i }));

    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find(
        ([p, opts]) =>
          p === '/admin/items/pack-1/contents' && (opts as RequestInit)?.method === 'PUT'
      );
      expect(call).toBeDefined();
      const body = JSON.parse((call![1] as RequestInit).body as string);
      expect(body).toEqual({ contents: [{ itemId: 'c1', quantity: 1 }] });
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Pack contents saved');
  });

  it('toasts "That item no longer exists" and opens no editor when the pack detail comes back null', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path.startsWith('/admin/items?')) {
        return Promise.resolve(
          paginated([
            makeItem({ id: 'pack-1', name: "Explorer's Pack", category: 'Equipment Pack' }),
          ])
        );
      }
      // The detail endpoint answers null once the item is gone.
      if (path.startsWith('/srd/items/')) return Promise.resolve(null);
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    renderWithQueryClient(<AdminEquipmentPage />);
    await screen.findByText("Explorer's Pack");

    await user.click(screen.getByRole('button', { name: /contents/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('That item no longer exists'));
    expect(mockToastError).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: /edit contents of/i })).not.toBeInTheDocument();
  });

  it('toasts and re-enables the save button when saving contents fails', async () => {
    mockApiFetch.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === '/admin/items/pack-1/contents' && opts?.method === 'PUT') {
        return Promise.reject(new Error('save boom'));
      }
      if (path.startsWith('/admin/items?')) {
        return Promise.resolve(
          paginated([
            makeItem({ id: 'pack-1', name: "Explorer's Pack", category: 'Equipment Pack' }),
          ])
        );
      }
      if (path.startsWith('/srd/items/')) {
        return Promise.resolve({
          id: 'pack-1',
          contents: [{ itemId: 'c1', name: 'Bedroll', quantity: 1 }],
        });
      }
      return Promise.resolve(undefined);
    });
    const user = userEvent.setup();
    renderWithQueryClient(<AdminEquipmentPage />);
    await screen.findByText("Explorer's Pack");

    await user.click(screen.getByRole('button', { name: /contents/i }));
    await screen.findByLabelText('Bedroll quantity');
    await user.click(screen.getByRole('button', { name: /save contents/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('save boom'));
    // The dialog stays open and the button returns to enabled "Save contents".
    const saveButton = await screen.findByRole('button', { name: /save contents/i });
    expect(saveButton).toBeEnabled();
  });

  it('shows a retryable error when the list fails to load', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApiFetch.mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    renderWithQueryClient(<AdminEquipmentPage />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load items');
    expect(screen.queryByText(/no shared items yet/i)).not.toBeInTheDocument();

    wireApi([makeItem()]);
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText("Explorer's Pack")).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('typing in search resets to page 1', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path.includes('page=2')) {
        return Promise.resolve({
          data: [makeItem({ id: 'item-2', name: 'Second Page Mount', category: 'Mount' })],
          total: 21,
          page: 2,
          lastPage: 2,
        });
      }
      return Promise.resolve({
        data: [makeItem({ name: 'First Page Mount', category: 'Mount' })],
        total: 21,
        page: 1,
        lastPage: 2,
      });
    });
    const user = userEvent.setup();
    renderWithQueryClient(<AdminEquipmentPage />);
    await screen.findByText('First Page Mount');
    await user.click(screen.getByRole('button', { name: /next/i }));
    await screen.findByText('Second Page Mount');

    fireEvent.change(screen.getByLabelText(/search items/i), { target: { value: 'mount' } });

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/items?limit=20&page=1&q=mount')
    );
    expect(mockApiFetch).not.toHaveBeenCalledWith('/admin/items?limit=20&page=2&q=mount');
    expect(await screen.findByText(/page 1 of 2/i)).toBeInTheDocument();
  });

  it('create refetches the list once before it shows again', async () => {
    let created = false;
    let releaseRefetch: () => void = () => {};
    mockApiFetch.mockImplementation((path: string, opts?: RequestInit) => {
      if (path === '/admin/items' && opts?.method === 'POST') {
        created = true;
        return Promise.resolve(undefined);
      }
      if (path.startsWith('/admin/items?')) {
        if (!created) return Promise.resolve(paginated([]));
        // Hold the post-create refetch so the test can look at the screen
        // while it is in flight.
        return new Promise(resolve => {
          releaseRefetch = () =>
            resolve(paginated([makeItem({ name: 'Riding Camel', category: 'Mount' })]));
        });
      }
      return Promise.resolve(undefined);
    });
    const listGets = () =>
      mockApiFetch.mock.calls.filter(
        ([p]) => typeof p === 'string' && p.startsWith('/admin/items?')
      ).length;
    const user = userEvent.setup();
    renderWithQueryClient(<AdminEquipmentPage />);
    await screen.findByText(/no shared items yet/i);
    expect(listGets()).toBe(1);

    await user.click(screen.getByRole('button', { name: /new item/i }));
    await user.type(screen.getByLabelText(/^name/i), 'Riding Camel');
    await user.selectOptions(screen.getByLabelText(/^category/i), 'Mount');
    await user.click(screen.getByRole('button', { name: /create item/i }));

    // The form stays up while the refetch runs, so the stale empty list never
    // shows.
    await waitFor(() => expect(listGets()).toBe(2));
    expect(screen.getByRole('heading', { name: 'New item' })).toBeInTheDocument();
    expect(screen.queryByText(/no shared items yet/i)).not.toBeInTheDocument();

    releaseRefetch();
    expect(await screen.findByText('Riding Camel')).toBeInTheDocument();
    expect(screen.queryByText(/no shared items yet/i)).not.toBeInTheDocument();
    expect(listGets()).toBe(2);
  });
});
