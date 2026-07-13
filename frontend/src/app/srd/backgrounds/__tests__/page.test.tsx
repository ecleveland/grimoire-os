import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BackgroundListPage from '../page';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
import type { SrdBackground } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

// The page is a client component (VEG-431): the list rides the credentialed
// useApiQuery so the caller's homebrew appears; deletes go through apiFetch.
const mockUseApiQuery = vi.fn();
const mockInvalidateApiPath = vi.fn();
vi.mock('@/lib/query', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/query')>()),
  useApiQuery: (path: string) => mockUseApiQuery(path),
  invalidateApiPath: (...args: unknown[]) => mockInvalidateApiPath(...args),
}));

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({}),
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockToast = { success: vi.fn(), error: vi.fn() };
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => mockToast.success(...a),
    error: (...a: unknown[]) => mockToast.error(...a),
  },
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeBackground(over: Partial<SrdBackground> = {}): SrdBackground {
  return {
    id: 'bg-1',
    name: 'Acolyte',
    skillProficiencies: ['Insight', 'Religion'],
    toolProficiencies: [],
    languages: 0,
    originFeat: { id: 'feat-mi', name: 'Magic Initiate' },
    originFeatOption: 'Cleric',
    personalityTraits: [],
    ideals: [],
    bonds: [],
    flaws: [],
    source: 'SRD 5.2.1',
    contentSource: 'srd',
    createdById: null,
    ...over,
  };
}

const HOMEBREW = makeBackground({
  id: 'bg-hb',
  name: 'Gravedigger',
  contentSource: 'homebrew',
  createdById: 'u1',
  originFeat: null,
  originFeatOption: null,
  source: 'Homebrew',
});

function anon() {
  mockUseAuth.mockReturnValue({
    isAuthenticated: false,
    isLoading: false,
    likelyAuthenticated: false,
    isAdmin: false,
    user: null,
  });
}

function authAsOwner() {
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    likelyAuthenticated: true,
    isAdmin: false,
    user: { userId: 'u1' },
  });
}

function authAsAdmin() {
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    likelyAuthenticated: true,
    isAdmin: true,
    user: { userId: 'admin-1' },
  });
}

function queryResult(over: Record<string, unknown> = {}) {
  return { data: [makeBackground()], isLoading: false, isError: false, ...over };
}

function renderPage() {
  return render(
    <PrintTrayProvider>
      <BackgroundListPage />
    </PrintTrayProvider>
  );
}

/** The persisted tray contents, for asserting tray state after a toggle. */
function storedTray(): unknown {
  return JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY) ?? '[]');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BackgroundListPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    anon();
    mockUseApiQuery.mockReturnValue(queryResult());
  });

  describe('rendering', () => {
    it('fetches /srd/backgrounds and renders the list', () => {
      renderPage();

      expect(mockUseApiQuery).toHaveBeenCalledWith('/srd/backgrounds');
      expect(screen.getByText('Acolyte')).toBeInTheDocument();
      expect(screen.getByText(/Skills: Insight, Religion/)).toBeInTheDocument();
      expect(screen.getByText(/Feat: Magic Initiate \(Cleric\)/)).toBeInTheDocument();
    });

    it('renders a loading state while the list is in flight', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: undefined, isLoading: true }));

      renderPage();

      expect(screen.getByText(/Loading backgrounds/)).toBeInTheDocument();
    });

    it('renders an error state when the fetch rejects', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: undefined, isError: true }));

      renderPage();

      expect(screen.getByText(/Failed to load backgrounds/)).toBeInTheDocument();
    });

    it('renders the feat name without an option suffix when originFeatOption is null', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({
          data: [
            makeBackground({
              name: 'Criminal',
              originFeat: { id: 'feat-alert', name: 'Alert' },
              originFeatOption: null,
            }),
          ],
        })
      );

      renderPage();

      expect(screen.getByText(/Feat: Alert/)).toBeInTheDocument();
      expect(screen.queryByText(/Alert \(/)).not.toBeInTheDocument();
    });

    it('omits the feat line when a background has no origin feat', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({ data: [makeBackground({ originFeat: null, originFeatOption: null })] })
      );

      renderPage();

      expect(screen.queryByText(/Feat:/)).not.toBeInTheDocument();
    });
  });

  describe('homebrew backgrounds (VEG-431)', () => {
    it('shows the create link to authenticated users', () => {
      authAsOwner();

      renderPage();

      expect(screen.getByRole('link', { name: 'Create background' })).toHaveAttribute(
        'href',
        '/srd/backgrounds/new'
      );
    });

    it('hides the create link from anonymous visitors', () => {
      renderPage();

      expect(screen.queryByRole('link', { name: 'Create background' })).not.toBeInTheDocument();
    });

    it('badges homebrew rows and not SRD rows', () => {
      authAsOwner();
      mockUseApiQuery.mockReturnValue(queryResult({ data: [makeBackground(), HOMEBREW] }));

      renderPage();

      expect(screen.getByText('Homebrew')).toBeInTheDocument();
      expect(screen.getByText('Gravedigger')).toBeInTheDocument();
    });

    it('shows Edit and Delete for the owner of a homebrew background', async () => {
      authAsOwner();
      mockUseApiQuery.mockReturnValue(queryResult({ data: [HOMEBREW] }));
      const user = userEvent.setup();

      renderPage();
      // The manage controls live in the card body, revealed on expand.
      await user.click(screen.getByRole('button', { name: /Gravedigger/, expanded: false }));

      expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
        'href',
        '/srd/backgrounds/bg-hb/edit'
      );
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it('shows no Edit/Delete on SRD rows, even for admins', async () => {
      authAsAdmin();
      mockUseApiQuery.mockReturnValue(queryResult({ data: [makeBackground()] }));
      const user = userEvent.setup();

      renderPage();
      await user.click(screen.getByRole('button', { name: /Acolyte/, expanded: false }));

      expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    it("shows no Edit/Delete on another user's homebrew", async () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        likelyAuthenticated: true,
        isAdmin: false,
        user: { userId: 'someone-else' },
      });
      mockUseApiQuery.mockReturnValue(queryResult({ data: [HOMEBREW] }));
      const user = userEvent.setup();

      renderPage();
      await user.click(screen.getByRole('button', { name: /Gravedigger/, expanded: false }));

      expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    it('lets an admin manage shared backgrounds', async () => {
      authAsAdmin();
      mockUseApiQuery.mockReturnValue(
        queryResult({
          data: [makeBackground({ contentSource: 'shared', createdById: 'other-admin' })],
        })
      );
      const user = userEvent.setup();

      renderPage();
      await user.click(screen.getByRole('button', { name: /Acolyte/, expanded: false }));

      expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it('deletes after confirmation and invalidates the list', async () => {
      authAsOwner();
      mockUseApiQuery.mockReturnValue(queryResult({ data: [HOMEBREW] }));
      mockApiFetch.mockResolvedValue(undefined);
      const user = userEvent.setup();

      renderPage();

      await user.click(screen.getByRole('button', { name: /Gravedigger/, expanded: false }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete background' }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('/srd/backgrounds/bg-hb', {
          method: 'DELETE',
        });
      });
      expect(mockToast.success).toHaveBeenCalledWith('Deleted Gravedigger');
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/backgrounds');
    });

    it('surfaces a delete failure as an error toast', async () => {
      authAsOwner();
      mockUseApiQuery.mockReturnValue(queryResult({ data: [HOMEBREW] }));
      mockApiFetch.mockRejectedValue(new Error('You can only modify your own homebrew content'));
      const user = userEvent.setup();

      renderPage();

      await user.click(screen.getByRole('button', { name: /Gravedigger/, expanded: false }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete background' }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          'You can only modify your own homebrew content'
        );
      });
      expect(mockInvalidateApiPath).not.toHaveBeenCalled();
    });

    it('surfaces a non-Error delete rejection with fallback copy', async () => {
      authAsOwner();
      mockUseApiQuery.mockReturnValue(queryResult({ data: [HOMEBREW] }));
      mockApiFetch.mockRejectedValue('boom');
      const user = userEvent.setup();

      renderPage();

      await user.click(screen.getByRole('button', { name: /Gravedigger/, expanded: false }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete background' }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to delete background');
      });
    });
  });

  describe('print set selection', () => {
    it('toggles a background into the tray from its list card', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: 'Add Acolyte to print set' }));

      expect(storedTray()).toEqual([{ type: 'background', id: 'bg-1' }]);
      expect(screen.getByRole('button', { name: 'Remove Acolyte from print set' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    it('removes the background on second toggle', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: 'Add Acolyte to print set' }));
      await user.click(screen.getByRole('button', { name: 'Remove Acolyte from print set' }));

      expect(storedTray()).toEqual([]);
    });
  });
});
