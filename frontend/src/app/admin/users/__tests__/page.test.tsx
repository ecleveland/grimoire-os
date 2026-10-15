import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithQueryClient } from '@/test-utils/query';
import AdminUsersPage from '../page';
import type { User } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockReplace = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
// The page's redirect effect depends on `router`, so the mock must be
// referentially stable across renders or the effect re-fires forever.
const stableRouter = { replace: (...args: unknown[]) => mockReplace(...args) };
vi.mock('next/navigation', () => ({
  useRouter: () => stableRouter,
  usePathname: () => '/admin/users',
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

function makeUser(over: Partial<User> = {}): User {
  return {
    id: 'user-1',
    username: 'gandalf',
    displayName: 'Gandalf the Grey',
    email: 'gandalf@middle.earth',
    role: 'dungeon_master',
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function paginated(users: User[], total = users.length) {
  return { data: users, total, page: 1, lastPage: 1 };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockReplace.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockUseAuth.mockReturnValue({ isAdmin: true });
});

describe('AdminUsersPage', () => {
  it('redirects non-admin users to the dashboard and renders nothing', async () => {
    mockUseAuth.mockReturnValue({ isAdmin: false });
    const { container } = renderWithQueryClient(<AdminUsersPage />);
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
    expect(container.querySelector('table')).not.toBeInTheDocument();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('waits for auth hydration before redirecting (no bounce for an admin mid-hydration)', async () => {
    // Pre-hydration the provider reports isAdmin:false / isLoading:true. Acting
    // on that would bounce a legitimately-authed admin on every refresh.
    mockUseAuth.mockReturnValue({ isAdmin: false, isLoading: true });
    renderWithQueryClient(<AdminUsersPage />);
    await Promise.resolve();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('shows the loading state before the fetch resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<AdminUsersPage />);
    expect(screen.getByText(/loading users/i)).toBeInTheDocument();
  });

  it('renders the user table from the paginated response', async () => {
    mockApiFetch.mockResolvedValue(
      paginated([
        makeUser(),
        makeUser({
          id: 'user-2',
          username: 'frodo',
          displayName: undefined,
          email: 'frodo@middle.earth',
        }),
      ])
    );
    renderWithQueryClient(<AdminUsersPage />);
    expect(await screen.findByText('gandalf')).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith('/admin/users?limit=20&page=1');
    expect(screen.getByText('Gandalf the Grey')).toBeInTheDocument();
    expect(screen.getByText('gandalf@middle.earth')).toBeInTheDocument();
    expect(screen.getByText('frodo')).toBeInTheDocument();
  });

  it('toasts an error when the user list fails to load', async () => {
    mockApiFetch.mockRejectedValue(new Error('boom'));
    renderWithQueryClient(<AdminUsersPage />);
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to load users'));
  });

  it('PATCHes the new role and updates the row on change', async () => {
    mockApiFetch.mockResolvedValueOnce(paginated([makeUser()]));
    mockApiFetch.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderWithQueryClient(<AdminUsersPage />);
    const select = await screen.findByRole('combobox');
    await user.selectOptions(select, 'admin');
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenLastCalledWith('/admin/users/user-1', {
        method: 'PATCH',
        body: JSON.stringify({ role: 'admin' }),
      })
    );
    expect(mockToastSuccess).toHaveBeenCalledWith('Role updated');
    expect((select as HTMLSelectElement).value).toBe('admin');
  });

  it('toasts the error message when the role update fails', async () => {
    mockApiFetch.mockResolvedValueOnce(paginated([makeUser()]));
    mockApiFetch.mockRejectedValueOnce(new Error('nope'));
    const user = userEvent.setup();
    renderWithQueryClient(<AdminUsersPage />);
    await user.selectOptions(await screen.findByRole('combobox'), 'admin');
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('nope'));
  });

  it('toasts the fallback message when the role update rejects with a non-Error', async () => {
    mockApiFetch.mockResolvedValueOnce(paginated([makeUser()]));
    mockApiFetch.mockRejectedValueOnce('string failure');
    const user = userEvent.setup();
    renderWithQueryClient(<AdminUsersPage />);
    await user.selectOptions(await screen.findByRole('combobox'), 'admin');
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to update role'));
  });

  it('Delete opens a confirm dialog warning that all user content is deleted (VEG-312)', async () => {
    mockApiFetch.mockResolvedValueOnce(paginated([makeUser()]));
    const user = userEvent.setup();
    renderWithQueryClient(<AdminUsersPage />);
    await user.click(await screen.findByRole('button', { name: /delete/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/delete user\?/i)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/permanently deletes everything they created/i)
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/campaigns/i)).toBeInTheDocument();
    // No DELETE issued until confirmation
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('DELETEs the user on confirmation and removes the row', async () => {
    // The delete invalidates the list, so the second GET is the refetch that
    // drops the row.
    mockApiFetch.mockResolvedValueOnce(paginated([makeUser()]));
    mockApiFetch.mockResolvedValueOnce(undefined);
    mockApiFetch.mockResolvedValueOnce(paginated([]));
    const user = userEvent.setup();
    renderWithQueryClient(<AdminUsersPage />);
    await user.click(await screen.findByRole('button', { name: /delete/i }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /delete/i }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith('/admin/users/user-1', { method: 'DELETE' })
    );
    expect(mockToastSuccess).toHaveBeenCalledWith('User deleted');
    await waitFor(() => expect(screen.queryByText('gandalf')).not.toBeInTheDocument());
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
    expect(mockApiFetch).toHaveBeenLastCalledWith('/admin/users?limit=20&page=1');
  });

  it('keeps the row and toasts the backend message when the delete fails', async () => {
    mockApiFetch.mockResolvedValueOnce(paginated([makeUser()]));
    mockApiFetch.mockRejectedValueOnce(new Error('still owns content'));
    const user = userEvent.setup();
    renderWithQueryClient(<AdminUsersPage />);
    await user.click(await screen.findByRole('button', { name: /delete/i }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('still owns content'));
    expect(screen.getByText('gandalf')).toBeInTheDocument();
  });

  it('toasts the fallback message when the delete rejects with a non-Error', async () => {
    mockApiFetch.mockResolvedValueOnce(paginated([makeUser()]));
    mockApiFetch.mockRejectedValueOnce('string failure');
    const user = userEvent.setup();
    renderWithQueryClient(<AdminUsersPage />);
    await user.click(await screen.findByRole('button', { name: /delete/i }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to delete user'));
  });

  it('dismissing the dialog via Cancel issues no DELETE', async () => {
    mockApiFetch.mockResolvedValueOnce(paginated([makeUser()]));
    const user = userEvent.setup();
    renderWithQueryClient(<AdminUsersPage />);
    await user.click(await screen.findByRole('button', { name: /delete/i }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(screen.getByText('gandalf')).toBeInTheDocument();
  });

  it('deleting the last row on page 2 refetches page 1', async () => {
    const pageOne = Array.from({ length: 20 }, (_, i) =>
      makeUser({ id: `user-${i}`, username: `user${i}` })
    );
    let pageOneTotal = 21;
    let pageTwo = [makeUser({ id: 'user-last', username: 'straggler' })];
    mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') {
        pageTwo = [];
        pageOneTotal = 20;
        return Promise.resolve(undefined);
      }
      if (path === '/admin/users?limit=20&page=2') {
        return Promise.resolve({ data: pageTwo, total: pageOneTotal, page: 2, lastPage: 2 });
      }
      return Promise.resolve({
        data: pageOne,
        total: pageOneTotal,
        page: 1,
        lastPage: pageOneTotal > 20 ? 2 : 1,
      });
    });
    const user = userEvent.setup();
    renderWithQueryClient(<AdminUsersPage />);
    await screen.findByText('user0');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await screen.findByText('straggler');
    await user.click(screen.getByRole('button', { name: /delete/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(screen.queryByText('straggler')).not.toBeInTheDocument());
    expect(await screen.findByText('user0')).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenLastCalledWith('/admin/users?limit=20&page=1');
  });

  it('shows a retryable error when the list fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('boom'));
    mockApiFetch.mockResolvedValueOnce(paginated([makeUser()]));
    const user = userEvent.setup();
    renderWithQueryClient(<AdminUsersPage />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load users');
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('gandalf')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
