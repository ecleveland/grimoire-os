import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import SpellListPage from '../page';
import { PrintTrayProvider } from '@/lib/print-tray-context';
import type { SrdSpell, PaginatedResponse } from '@/lib/types';

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

const fireball: SrdSpell = {
  id: 'sp-1',
  name: 'Fireball',
  level: 3,
  school: 'Evocation',
  castingTime: '1 action',
  range: '150 feet',
  components: 'V, S, M',
  duration: 'Instantaneous',
  description: 'A bright streak flashes from your pointing finger.',
  classes: ['Sorcerer', 'Wizard'],
  ritual: false,
  concentration: false,
  material: 'A tiny ball of bat guano and sulfur',
  higherLevels: 'Damage increases by 1d6 per slot above 3rd.',
  source: 'SRD 5.2.1',
};

const lightCantrip: SrdSpell = {
  id: 'sp-2',
  name: 'Light',
  level: 0,
  school: 'Evocation',
  castingTime: '1 action',
  range: 'Touch',
  components: 'V, M',
  duration: '1 hour',
  description: 'You touch one object.',
  classes: ['Bard', 'Cleric'],
  ritual: false,
  concentration: false,
  source: 'SRD 5.2.1',
};

function makeResponse(spells: SrdSpell[]): PaginatedResponse<SrdSpell> {
  return { data: spells, total: spells.length, page: 1, lastPage: 1 };
}

function renderPage() {
  return render(
    <PrintTrayProvider>
      <SpellListPage />
    </PrintTrayProvider>
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SpellListPage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(makeResponse([fireball, lightCantrip]));
    mockUseAuth.mockReturnValue({ isAdmin: false, isAuthenticated: false, user: null });
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
  });

  describe('rendering', () => {
    it('renders the heading "Spells"', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^Spells$/i })).toBeInTheDocument();
      });
    });

    it('renders spell names after load', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Fireball')).toBeInTheDocument();
        expect(screen.getByText('Light')).toBeInTheDocument();
      });
    });

    it('renders a cantrip (level 0) with the Cantrip label', async () => {
      renderPage();
      const card = (await screen.findByText('Light')).closest('button')!;
      expect(within(card).getByText(/Cantrip/)).toBeInTheDocument();
    });

    it('renders the leveled spell with its level label', async () => {
      renderPage();
      const card = (await screen.findByText('Fireball')).closest('button')!;
      expect(within(card).getByText(/Level 3/)).toBeInTheDocument();
    });

    it('renders the search input', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search spells...')).toBeInTheDocument();
      });
    });

    it('toasts when the list fetch fails', async () => {
      mockApiFetch.mockReset();
      mockApiFetch.mockRejectedValue(new Error('boom'));
      renderPage();
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to load spells', { id: 'load-spells' });
      });
    });
  });

  describe('filters', () => {
    it('sends level, school, and class filters in the query', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Fireball');
      mockApiFetch.mockClear();

      await user.selectOptions(screen.getByLabelText('Level'), '3');
      await user.selectOptions(screen.getByLabelText('School'), 'Evocation');
      await user.selectOptions(screen.getByLabelText('Class'), 'Wizard');

      await waitFor(() => {
        const url = mockApiFetch.mock.calls.at(-1)?.[0] as string;
        expect(url).toContain('level=3');
        expect(url).toContain('school=Evocation');
        expect(url).toContain('class=Wizard');
      });
    });

    it('sends level=0 for the Cantrip filter', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Fireball');
      mockApiFetch.mockClear();

      await user.selectOptions(screen.getByLabelText('Level'), '0');

      await waitFor(() => {
        const url = mockApiFetch.mock.calls.at(-1)?.[0] as string;
        expect(url).toContain('level=0');
      });
    });
  });

  describe('detail modal', () => {
    function routeApi(
      detail: (path: string) => Promise<unknown> = () => Promise.resolve(fireball)
    ) {
      mockApiFetch.mockReset();
      mockApiFetch.mockImplementation((path: string) => {
        if (path.startsWith('/srd/spells/')) return detail(path);
        return Promise.resolve(makeResponse([fireball, lightCantrip]));
      });
    }

    it('fetches and opens the detail when a spell card is clicked', async () => {
      routeApi();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Fireball/i }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('/srd/spells/sp-1');
      });
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText(/A bright streak flashes/)).toBeInTheDocument();
      expect(within(dialog).getByText('150 feet')).toBeInTheDocument();
      expect(within(dialog).getByText('V, S, M')).toBeInTheDocument();
      expect(within(dialog).getByText('At Higher Levels')).toBeInTheDocument();
      expect(within(dialog).getByText(/A tiny ball of bat guano/)).toBeInTheDocument();
    });

    it('renders Concentration and Ritual badges when set', async () => {
      routeApi(() => Promise.resolve({ ...fireball, concentration: true, ritual: true }));
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Fireball/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('Concentration')).toBeInTheDocument();
      expect(within(dialog).getByText('Ritual')).toBeInTheDocument();
    });

    it('omits Material and At Higher Levels when absent', async () => {
      routeApi(() => Promise.resolve(lightCantrip));
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Light/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).queryByText('Material')).not.toBeInTheDocument();
      expect(within(dialog).queryByText('At Higher Levels')).not.toBeInTheDocument();
    });

    it('toasts and closes when the detail resolves to null', async () => {
      routeApi(() => Promise.resolve(null));
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Fireball/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText(/loading spell/i)).not.toBeInTheDocument();
    });

    it('toasts and closes when the detail fetch rejects', async () => {
      routeApi(() => Promise.reject(new Error('network')));
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Fireball/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  // ── Homebrew spells (VEG-294) ───────────────────────────────────────────────

  describe('homebrew spells', () => {
    const soulBonfire: SrdSpell = {
      ...fireball,
      id: 'hb-1',
      name: 'Soul Bonfire',
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
        if (path.startsWith('/srd/spells/hb-1')) return Promise.resolve(soulBonfire);
        if (path.startsWith('/srd/spells/')) return Promise.resolve(fireball);
        return Promise.resolve(makeResponse([fireball, soulBonfire]));
      });
    }

    function authAsOwner() {
      mockUseAuth.mockReturnValue({
        isAdmin: false,
        isAuthenticated: true,
        user: { userId: 'u1' },
      });
    }

    it('shows a Create spell link for signed-in users', async () => {
      authAsOwner();
      renderPage();

      const link = await screen.findByRole('link', { name: /create spell/i });
      expect(link).toHaveAttribute('href', '/srd/spells/new');
    });

    it('hides the Create spell link for anonymous visitors', async () => {
      renderPage();

      await screen.findByText('Fireball');
      expect(screen.queryByRole('link', { name: /create spell/i })).not.toBeInTheDocument();
    });

    it('flags homebrew spells with a badge in the list', async () => {
      authAsOwner();
      routeApi();
      renderPage();

      const card = (await screen.findByText('Soul Bonfire')).closest('button')!;
      expect(within(card).getByText('Homebrew')).toBeInTheDocument();

      const srdCard = screen.getByText('Fireball').closest('button')!;
      expect(within(srdCard).queryByText('Homebrew')).not.toBeInTheDocument();
    });

    it('offers Edit and Delete on the owner’s homebrew spell in the detail modal', async () => {
      authAsOwner();
      routeApi();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Soul Bonfire/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('link', { name: /edit/i })).toHaveAttribute(
        'href',
        '/srd/spells/hb-1/edit'
      );
      expect(within(dialog).getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('offers no Edit/Delete on SRD spells', async () => {
      authAsOwner();
      routeApi();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Fireball/i }));

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
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Soul Bonfire/i }));

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
        if (path.startsWith('/srd/spells/sh-1'))
          return Promise.resolve({
            ...fireball,
            id: 'sh-1',
            contentSource: 'shared',
            createdById: 'u1',
          });
        return Promise.resolve(
          makeResponse([{ ...fireball, id: 'sh-1', contentSource: 'shared', createdById: 'u1' }])
        );
      });
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Fireball/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('deletes a homebrew spell after confirmation and refreshes the list', async () => {
      authAsOwner();
      routeApi();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Soul Bonfire/i }));
      await user.click(await screen.findByRole('button', { name: /delete/i }));
      await user.click(await screen.findByRole('button', { name: /^Delete spell$/i }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/srd/spells/hb-1',
          expect.objectContaining({ method: 'DELETE' })
        );
      });
      expect(toast.success).toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      const listCalls = mockApiFetch.mock.calls.filter(([path]) =>
        String(path).startsWith('/srd/spells?')
      );
      expect(listCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('toasts and keeps the modal open when the delete fails (Error)', async () => {
      authAsOwner();
      routeApi({ onDelete: () => Promise.reject(new Error('nope')) });
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Soul Bonfire/i }));
      await user.click(await screen.findByRole('button', { name: /delete/i }));
      await user.click(await screen.findByRole('button', { name: /^Delete spell$/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('nope');
      });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('falls back to a generic message for a non-Error delete rejection', async () => {
      authAsOwner();
      routeApi({ onDelete: () => Promise.reject('boom') });
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Soul Bonfire/i }));
      await user.click(await screen.findByRole('button', { name: /delete/i }));
      await user.click(await screen.findByRole('button', { name: /^Delete spell$/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to delete spell');
      });
    });

    it('clamps back to an in-range page after deleting the last spell on the last page', async () => {
      authAsOwner();
      mockApiFetch.mockReset();
      mockApiFetch.mockImplementation(
        (path: string, options?: { method?: string }): Promise<unknown> => {
          if (options?.method === 'DELETE') return Promise.resolve(undefined);
          if (path.startsWith('/srd/spells/hb-1')) return Promise.resolve(soulBonfire);
          const params = new URLSearchParams(String(path).split('?')[1]);
          const page = Number(params.get('page'));
          const deleted = mockApiFetch.mock.calls.some(
            ([, o]) => (o as { method?: string } | undefined)?.method === 'DELETE'
          );
          if (deleted) {
            return Promise.resolve(
              page > 1
                ? { data: [], total: 20, page, lastPage: 1 }
                : { data: [fireball], total: 20, page: 1, lastPage: 1 }
            );
          }
          return Promise.resolve(
            page > 1
              ? { data: [soulBonfire], total: 21, page, lastPage: 2 }
              : { data: [fireball], total: 21, page: 1, lastPage: 2 }
          );
        }
      );
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByTestId('pagination'));
      await screen.findByText('Soul Bonfire');

      await user.click(screen.getByRole('button', { name: /^Soul Bonfire/i }));
      await user.click(await screen.findByRole('button', { name: /delete/i }));
      await user.click(await screen.findByRole('button', { name: /^Delete spell$/i }));

      await waitFor(() => {
        const listCalls = mockApiFetch.mock.calls.filter(([p]) =>
          String(p).startsWith('/srd/spells?')
        );
        const lastList = String(listCalls.at(-1)?.[0]);
        expect(new URLSearchParams(lastList.split('?')[1]).get('page')).toBe('1');
      });
      expect(await screen.findByText('Fireball')).toBeInTheDocument();
    });
  });
});
