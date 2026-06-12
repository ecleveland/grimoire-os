import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import FeatListPage from '../page';
import type { SrdFeat, PaginatedResponse } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('@/components/Pagination', () => ({
  default: ({ onPageChange }: { onPageChange: (p: number) => void }) => (
    <button data-testid="pagination" onClick={() => onPageChange(2)} />
  ),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const alert: SrdFeat = {
  id: 'feat-1',
  name: 'Alert',
  description: 'Always ready for danger, you gain initiative benefits.',
  prerequisite: undefined,
  benefits: ['Initiative Proficiency: add your Proficiency Bonus to Initiative.'],
  category: 'Origin',
  repeatable: false,
  source: 'SRD 5.2.1',
  contentSource: 'srd',
};

const sharpshooter: SrdFeat = {
  id: 'feat-2',
  name: 'Sharpshooter',
  description: 'You have mastered ranged weapons.',
  prerequisite: 'Level 4+, Dexterity 13+',
  category: 'General',
  repeatable: false,
  source: 'SRD 5.2.1',
  contentSource: 'srd',
};

function makeResponse(feats: SrdFeat[]): PaginatedResponse<SrdFeat> {
  return { data: feats, total: feats.length, page: 1, lastPage: 1 };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FeatListPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(makeResponse([alert, sharpshooter]));
    mockUseAuth.mockReturnValue({ isAdmin: false, isAuthenticated: false, user: null });
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  describe('rendering', () => {
    it('renders the heading "Feats"', async () => {
      render(<FeatListPage />);
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^Feats$/i })).toBeInTheDocument();
      });
    });

    it('renders feat names after load', async () => {
      render(<FeatListPage />);
      await waitFor(() => {
        expect(screen.getByText('Alert')).toBeInTheDocument();
        expect(screen.getByText('Sharpshooter')).toBeInTheDocument();
      });
    });

    it('shows category and prerequisite in the card metadata', async () => {
      render(<FeatListPage />);
      const card = (await screen.findByText('Sharpshooter')).closest('button')!;
      expect(within(card).getByText(/General/)).toBeInTheDocument();
      expect(within(card).getByText(/Level 4\+, Dexterity 13\+/)).toBeInTheDocument();
    });

    it('renders the search input', async () => {
      render(<FeatListPage />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search feats...')).toBeInTheDocument();
      });
    });

    it('toasts when the list fetch fails', async () => {
      mockApiFetch.mockReset();
      mockApiFetch.mockRejectedValue(new Error('boom'));
      render(<FeatListPage />);
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to load feats', { id: 'load-feats' });
      });
    });
  });

  describe('filters', () => {
    it('sends category, prerequisite, and repeatable filters in the query', async () => {
      const user = userEvent.setup();
      render(<FeatListPage />);
      await screen.findByText('Alert');
      mockApiFetch.mockClear();

      await user.selectOptions(screen.getByLabelText('Category'), 'Origin');
      await user.selectOptions(screen.getByLabelText('Prerequisite'), 'true');
      await user.selectOptions(screen.getByLabelText('Repeatable'), 'false');

      await waitFor(() => {
        const url = mockApiFetch.mock.calls.at(-1)?.[0] as string;
        expect(url).toContain('category=Origin');
        expect(url).toContain('hasPrerequisite=true');
        expect(url).toContain('repeatable=false');
      });
    });

    async function goToPage2(user: ReturnType<typeof userEvent.setup>) {
      await screen.findByText('Alert');
      await user.click(screen.getByTestId('pagination'));
      await waitFor(() => {
        const last = String(mockApiFetch.mock.calls.at(-1)?.[0]);
        expect(new URLSearchParams(last.split('?')[1]).get('page')).toBe('2');
      });
      mockApiFetch.mockClear();
    }

    it('issues exactly one fetch, with page=1, when a filter changes from page 2', async () => {
      const user = userEvent.setup();
      render(<FeatListPage />);
      await goToPage2(user);

      await user.selectOptions(screen.getByLabelText('Category'), 'Origin');

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      // The page reset and the filter change must land in the same commit —
      // an effect-based reset would issue a first fetch still on page=2.
      const params = new URLSearchParams(String(mockApiFetch.mock.calls[0][0]).split('?')[1]);
      expect(params.get('page')).toBe('1');
      expect(params.get('category')).toBe('Origin');
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });

    it('issues exactly one fetch, with page=1, when the debounced search commits from page 2', async () => {
      const user = userEvent.setup();
      render(<FeatListPage />);
      await goToPage2(user);

      fireEvent.change(screen.getByPlaceholderText('Search feats...'), {
        target: { value: 'sharp' },
      });

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
      const params = new URLSearchParams(String(mockApiFetch.mock.calls[0][0]).split('?')[1]);
      expect(params.get('page')).toBe('1');
      expect(params.get('q')).toBe('sharp');
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('detail modal', () => {
    function routeApi(detail: (path: string) => Promise<unknown> = () => Promise.resolve(alert)) {
      mockApiFetch.mockReset();
      mockApiFetch.mockImplementation((path: string) => {
        if (path.startsWith('/srd/feats/')) return detail(path);
        return Promise.resolve(makeResponse([alert, sharpshooter]));
      });
    }

    it('fetches and opens the detail when a feat card is clicked', async () => {
      routeApi();
      const user = userEvent.setup();
      render(<FeatListPage />);

      await user.click(await screen.findByRole('button', { name: /^Alert/i }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('/srd/feats/feat-1');
      });
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/Always ready for danger/)).toBeInTheDocument();
      expect(within(dialog).getByText(/Initiative Proficiency/)).toBeInTheDocument();
    });

    it('renders the Repeatable badge when set', async () => {
      routeApi(() => Promise.resolve({ ...alert, repeatable: true }));
      const user = userEvent.setup();
      render(<FeatListPage />);

      await user.click(await screen.findByRole('button', { name: /^Alert/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Repeatable')).toBeInTheDocument();
    });

    it('omits the Benefits section when absent', async () => {
      routeApi(() => Promise.resolve(sharpshooter));
      const user = userEvent.setup();
      render(<FeatListPage />);

      await user.click(await screen.findByRole('button', { name: /^Sharpshooter/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).queryByText('Benefits')).not.toBeInTheDocument();
    });

    it('toasts and closes when the detail resolves to null', async () => {
      routeApi(() => Promise.resolve(null));
      const user = userEvent.setup();
      render(<FeatListPage />);

      await user.click(await screen.findByRole('button', { name: /^Alert/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText(/loading feat/i)).not.toBeInTheDocument();
    });

    it('toasts and closes when the detail fetch rejects', async () => {
      routeApi(() => Promise.reject(new Error('network')));
      const user = userEvent.setup();
      render(<FeatListPage />);

      await user.click(await screen.findByRole('button', { name: /^Alert/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  // ── Homebrew feats (VEG-295) ───────────────────────────────────────────────

  describe('homebrew feats', () => {
    const luckyDodge: SrdFeat = {
      ...alert,
      id: 'hb-1',
      name: 'Lucky Dodge',
      contentSource: 'homebrew',
      createdById: 'u1',
      source: 'Homebrew',
    };

    function routeApi(overrides: { onDelete?: () => Promise<unknown> } = {}) {
      mockApiFetch.mockReset();
      mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
        if (options?.method === 'DELETE') {
          return (overrides.onDelete ?? (() => Promise.resolve(undefined)))();
        }
        if (path.startsWith('/srd/feats/hb-1')) return Promise.resolve(luckyDodge);
        if (path.startsWith('/srd/feats/')) return Promise.resolve(alert);
        return Promise.resolve(makeResponse([alert, luckyDodge]));
      });
    }

    function authAsOwner() {
      mockUseAuth.mockReturnValue({
        isAdmin: false,
        isAuthenticated: true,
        user: { userId: 'u1' },
      });
    }

    it('shows a Create feat link for signed-in users', async () => {
      authAsOwner();
      render(<FeatListPage />);

      const link = await screen.findByRole('link', { name: /create feat/i });
      expect(link).toHaveAttribute('href', '/srd/feats/new');
    });

    it('hides the Create feat link for anonymous visitors', async () => {
      render(<FeatListPage />);

      await screen.findByText('Alert');
      expect(screen.queryByRole('link', { name: /create feat/i })).not.toBeInTheDocument();
    });

    it('flags homebrew feats with a badge in the list', async () => {
      authAsOwner();
      routeApi();
      render(<FeatListPage />);

      const card = (await screen.findByText('Lucky Dodge')).closest('button')!;
      expect(within(card).getByText('Homebrew')).toBeInTheDocument();

      const srdCard = screen.getByText('Alert').closest('button')!;
      expect(within(srdCard).queryByText('Homebrew')).not.toBeInTheDocument();
    });

    it('offers Edit and Delete on the owner’s homebrew feat in the detail modal', async () => {
      authAsOwner();
      routeApi();
      const user = userEvent.setup();
      render(<FeatListPage />);

      await user.click(await screen.findByRole('button', { name: /^Lucky Dodge/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('link', { name: /edit/i })).toHaveAttribute(
        'href',
        '/srd/feats/hb-1/edit'
      );
      expect(within(dialog).getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('offers no Edit/Delete on SRD feats', async () => {
      authAsOwner();
      routeApi();
      const user = userEvent.setup();
      render(<FeatListPage />);

      await user.click(await screen.findByRole('button', { name: /^Alert/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).queryByRole('link', { name: /edit/i })).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    });

    it('offers no Edit/Delete on someone else’s homebrew', async () => {
      mockUseAuth.mockReturnValue({
        isAdmin: false,
        isAuthenticated: true,
        user: { userId: 'someone-else' },
      });
      routeApi();
      const user = userEvent.setup();
      render(<FeatListPage />);

      await user.click(await screen.findByRole('button', { name: /^Lucky Dodge/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    });

    it('lets an admin manage shared content', async () => {
      mockUseAuth.mockReturnValue({
        isAdmin: true,
        isAuthenticated: true,
        user: { userId: 'a1' },
      });
      mockApiFetch.mockReset();
      mockApiFetch.mockImplementation((path: string) => {
        if (path.startsWith('/srd/feats/sh-1'))
          return Promise.resolve({
            ...alert,
            id: 'sh-1',
            contentSource: 'shared',
            createdById: 'u1',
          });
        return Promise.resolve(
          makeResponse([{ ...alert, id: 'sh-1', contentSource: 'shared', createdById: 'u1' }])
        );
      });
      const user = userEvent.setup();
      render(<FeatListPage />);

      await user.click(await screen.findByRole('button', { name: /^Alert/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('deletes a homebrew feat after confirmation and refreshes the list', async () => {
      authAsOwner();
      routeApi();
      const user = userEvent.setup();
      render(<FeatListPage />);

      await user.click(await screen.findByRole('button', { name: /^Lucky Dodge/i }));
      await user.click(await screen.findByRole('button', { name: /delete/i }));
      await user.click(await screen.findByRole('button', { name: /^Delete feat$/i }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/srd/feats/hb-1',
          expect.objectContaining({ method: 'DELETE' })
        );
      });
      expect(toast.success).toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      const listCalls = mockApiFetch.mock.calls.filter(([path]) =>
        String(path).startsWith('/srd/feats?')
      );
      expect(listCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('toasts and keeps the modal open when the delete fails (Error)', async () => {
      authAsOwner();
      routeApi({ onDelete: () => Promise.reject(new Error('nope')) });
      const user = userEvent.setup();
      render(<FeatListPage />);

      await user.click(await screen.findByRole('button', { name: /^Lucky Dodge/i }));
      await user.click(await screen.findByRole('button', { name: /delete/i }));
      await user.click(await screen.findByRole('button', { name: /^Delete feat$/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('nope');
      });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('falls back to a generic message for a non-Error delete rejection', async () => {
      authAsOwner();
      routeApi({ onDelete: () => Promise.reject('boom') });
      const user = userEvent.setup();
      render(<FeatListPage />);

      await user.click(await screen.findByRole('button', { name: /^Lucky Dodge/i }));
      await user.click(await screen.findByRole('button', { name: /delete/i }));
      await user.click(await screen.findByRole('button', { name: /^Delete feat$/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to delete feat');
      });
    });

    it('clamps back to an in-range page after deleting the last feat on the last page', async () => {
      authAsOwner();
      mockApiFetch.mockReset();
      mockApiFetch.mockImplementation(
        (path: string, options?: { method?: string }): Promise<unknown> => {
          if (options?.method === 'DELETE') return Promise.resolve(undefined);
          if (path.startsWith('/srd/feats/hb-1')) return Promise.resolve(luckyDodge);
          const params = new URLSearchParams(String(path).split('?')[1]);
          const page = Number(params.get('page'));
          const deleted = mockApiFetch.mock.calls.some(
            ([, o]) => (o as { method?: string } | undefined)?.method === 'DELETE'
          );
          if (deleted) {
            return Promise.resolve(
              page > 1
                ? { data: [], total: 20, page, lastPage: 1 }
                : { data: [alert], total: 20, page: 1, lastPage: 1 }
            );
          }
          return Promise.resolve(
            page > 1
              ? { data: [luckyDodge], total: 21, page, lastPage: 2 }
              : { data: [alert], total: 21, page: 1, lastPage: 2 }
          );
        }
      );
      const user = userEvent.setup();
      render(<FeatListPage />);

      await user.click(await screen.findByTestId('pagination'));
      await screen.findByText('Lucky Dodge');

      await user.click(screen.getByRole('button', { name: /^Lucky Dodge/i }));
      await user.click(await screen.findByRole('button', { name: /delete/i }));
      await user.click(await screen.findByRole('button', { name: /^Delete feat$/i }));

      await waitFor(() => {
        const listCalls = mockApiFetch.mock.calls.filter(([p]) =>
          String(p).startsWith('/srd/feats?')
        );
        const lastList = String(listCalls.at(-1)?.[0]);
        expect(new URLSearchParams(lastList.split('?')[1]).get('page')).toBe('1');
      });
      expect(await screen.findByText('Alert')).toBeInTheDocument();
    });
  });
});
