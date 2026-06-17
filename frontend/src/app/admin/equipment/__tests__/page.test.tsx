import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    const { container } = render(<AdminEquipmentPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(container.querySelector('table')).not.toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('waits for auth hydration before redirecting', async () => {
    mockUseAuth.mockReturnValue({ isAdmin: false, isLoading: true });
    render(<AdminEquipmentPage />);
    await Promise.resolve();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('loads the shared-item list on mount', async () => {
    wireApi([makeItem(), makeItem({ id: 'item-2', name: 'Riding Horse', category: 'Mount' })]);
    render(<AdminEquipmentPage />);
    expect(await screen.findByText("Explorer's Pack")).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith('/admin/items?page=1&limit=20');
    expect(screen.getByText('Riding Horse')).toBeInTheDocument();
  });

  it('shows the empty state when there are no shared items', async () => {
    wireApi([]);
    render(<AdminEquipmentPage />);
    expect(await screen.findByText(/no shared items yet/i)).toBeInTheDocument();
  });

  it('toasts when the list fails to load', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    render(<AdminEquipmentPage />);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to load items'));
  });

  it('filtering by category refetches with the category param', async () => {
    wireApi([makeItem()]);
    const user = userEvent.setup();
    render(<AdminEquipmentPage />);
    await screen.findByText("Explorer's Pack");

    await user.selectOptions(screen.getByLabelText(/filter by category/i), 'Mount');

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/items?page=1&limit=20&category=Mount')
    );
  });

  it('searching refetches with the debounced q param', async () => {
    wireApi([makeItem()]);
    const user = userEvent.setup();
    render(<AdminEquipmentPage />);
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
    render(<AdminEquipmentPage />);
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
    render(<AdminEquipmentPage />);
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
    render(<AdminEquipmentPage />);
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

  it('deletes an item after confirmation and removes the row', async () => {
    wireApi([makeItem({ category: 'Mount', name: 'Riding Horse' })]);
    const user = userEvent.setup();
    render(<AdminEquipmentPage />);
    await screen.findByText('Riding Horse');

    await user.click(screen.getByRole('button', { name: /delete/i }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /delete/i }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/items/item-1', { method: 'DELETE' })
    );
    expect(mockToastSuccess).toHaveBeenCalledWith('Item deleted');
    await waitFor(() => expect(screen.queryByText('Riding Horse')).not.toBeInTheDocument());
  });

  it('only shows the Contents action for equipment packs', async () => {
    wireApi([
      makeItem({ id: 'item-1', name: "Explorer's Pack", category: 'Equipment Pack' }),
      makeItem({ id: 'item-2', name: 'Riding Horse', category: 'Mount' }),
    ]);
    render(<AdminEquipmentPage />);
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
    render(<AdminEquipmentPage />);
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
    render(<AdminEquipmentPage />);
    await screen.findByText("Explorer's Pack");

    await user.click(screen.getByRole('button', { name: /contents/i }));
    await screen.findByLabelText('Bedroll quantity');
    await user.click(screen.getByRole('button', { name: /save contents/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('save boom'));
    // The dialog stays open and the button returns to enabled "Save contents".
    const saveButton = await screen.findByRole('button', { name: /save contents/i });
    expect(saveButton).toBeEnabled();
  });
});
