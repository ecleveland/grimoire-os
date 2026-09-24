import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BackgroundDetailPage from '../page';
import { PrintTrayProvider } from '@/lib/print-tray-context';
import type { BackgroundFeature, SrdBackground } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

// The options are recorded too, so tests can check the error toast and that a
// delete disables the query.
const mockUseApiQuery = vi.fn();
const mockInvalidateApiPath = vi.fn();
vi.mock('@/lib/query', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/query')>()),
  useApiQuery: (path: string, options?: unknown) => mockUseApiQuery(path, options),
  invalidateApiPath: (...args: unknown[]) => mockInvalidateApiPath(...args),
}));

const mockRemoveQueries = vi.fn();
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ removeQueries: mockRemoveQueries }),
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

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'bg-1' }),
  useRouter: () => ({ push: mockPush }),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** The detail GET includes the background's features, which the list payload leaves out. */
type BackgroundWithFeatures = SrdBackground & { features?: BackgroundFeature[] };

function makeBackground(over: Partial<BackgroundWithFeatures> = {}): BackgroundWithFeatures {
  return {
    id: 'bg-1',
    name: 'Gravedigger',
    description: 'You turned the earth over the parish dead.',
    skillProficiencies: ['Insight', 'Religion'],
    toolProficiencies: ["Mason's tools"],
    languages: 2,
    equipment: 'Shovel, holy symbol, 10 GP',
    features: [
      { name: 'Grave Knowledge', description: 'You know who is buried where.' },
      { name: 'Quiet Company', description: 'The night shift never questions you.' },
    ],
    originFeat: { id: 'feat-mi', name: 'Magic Initiate' },
    originFeatOption: 'Cleric',
    personalityTraits: ['I speak softly around strangers.'],
    ideals: ['Rest. Everyone has earned it.'],
    bonds: ['The parish I served.'],
    flaws: ['I answer the dead out loud.'],
    source: 'Homebrew',
    contentSource: 'homebrew',
    createdById: 'u1',
    ...over,
  };
}

/** A background with every optional section left out. */
const BARE = makeBackground({
  description: undefined,
  toolProficiencies: [],
  languages: 0,
  equipment: undefined,
  features: [],
  personalityTraits: [],
  ideals: [],
  bonds: [],
  flaws: [],
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

const mockRefetch = vi.fn();

function queryResult(over: Record<string, unknown> = {}) {
  return {
    data: makeBackground(),
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: mockRefetch,
    ...over,
  };
}

function renderPage() {
  return render(
    <PrintTrayProvider>
      <BackgroundDetailPage />
    </PrintTrayProvider>
  );
}

function expectNoManageControls() {
  expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
}

async function confirmDelete() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  await user.click(screen.getByRole('button', { name: 'Delete background' }));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BackgroundDetailPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    anon();
    mockUseApiQuery.mockReturnValue(queryResult());
  });

  describe('loading and errors', () => {
    it('fetches /srd/backgrounds/bg-1 with the load-failure toast', () => {
      renderPage();

      expect(mockUseApiQuery).toHaveBeenCalledWith(
        '/srd/backgrounds/bg-1',
        expect.objectContaining({
          errorToast: { message: 'Failed to load background', id: 'load-background' },
          enabled: true,
        })
      );
    });

    it('renders a loading state while the background is in flight', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: undefined, isLoading: true }));

      renderPage();

      expect(screen.getByText('Loading background…')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '← Backgrounds' })).toHaveAttribute(
        'href',
        '/srd/backgrounds'
      );
    });

    it('shows the load-failure state with Retry when the fetch fails before a background loads', async () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: undefined, isError: true }));
      const user = userEvent.setup();

      renderPage();

      expect(screen.getByText('Failed to load background.')).toBeInTheDocument();
      expect(screen.queryByText('Background not found.')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it('disables Retry while a refetch is in flight', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({ data: undefined, isError: true, isFetching: true })
      );

      renderPage();

      expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    });

    it('shows the not-found state without Retry when the background is null', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: null }));

      renderPage();

      expect(screen.getByText('Background not found.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '← Backgrounds' })).toHaveAttribute(
        'href',
        '/srd/backgrounds'
      );
      expect(screen.getByRole('link', { name: 'Back to backgrounds' })).toHaveAttribute(
        'href',
        '/srd/backgrounds'
      );
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
      expect(screen.queryByText('Failed to load background.')).not.toBeInTheDocument();
    });

    it('keeps a loaded background on screen when a background refetch fails', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeBackground(), isError: true }));

      renderPage();

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Gravedigger');
      expect(screen.queryByText('Background not found.')).not.toBeInTheDocument();
      expect(screen.queryByText('Failed to load background.')).not.toBeInTheDocument();
    });
  });

  describe('header', () => {
    it('renders the back link, the name, the Homebrew badge and the print toggle', () => {
      renderPage();

      expect(screen.getByRole('link', { name: '← Backgrounds' })).toHaveAttribute(
        'href',
        '/srd/backgrounds'
      );
      const title = screen.getByRole('heading', { level: 1 });
      expect(title).toHaveTextContent('Gravedigger');
      expect(within(title).getByText('Homebrew')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Add Gravedigger to print set' })
      ).toBeInTheDocument();
    });

    it('leaves the Homebrew badge off an SRD background', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({
          data: makeBackground({
            contentSource: 'srd',
            createdById: null,
            source: 'SRD 5.2.1',
          }),
        })
      );

      renderPage();

      expect(screen.queryByText('Homebrew')).not.toBeInTheDocument();
    });

    it('lists the skills, the origin feat and its chosen option in the subtitle', () => {
      renderPage();

      expect(
        screen.getByText('Skills: Insight, Religion · Feat: Magic Initiate (Cleric)')
      ).toBeInTheDocument();
    });

    it('drops the option from the subtitle when the origin feat takes none', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({ data: makeBackground({ originFeatOption: null }) })
      );

      renderPage();

      expect(
        screen.getByText('Skills: Insight, Religion · Feat: Magic Initiate')
      ).toBeInTheDocument();
    });

    it('shows skills alone when the background has no origin feat', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({ data: makeBackground({ originFeat: null, originFeatOption: null }) })
      );

      renderPage();

      expect(screen.getByText('Skills: Insight, Religion')).toBeInTheDocument();
      expect(screen.queryByText(/Feat:/)).not.toBeInTheDocument();
    });
  });

  describe('body sections', () => {
    it('renders every section a fully populated background has', () => {
      renderPage();

      expect(screen.getByText('You turned the earth over the parish dead.')).toBeInTheDocument();

      expect(screen.getByRole('heading', { name: 'Tool Proficiencies' })).toBeInTheDocument();
      expect(screen.getByText("Mason's tools")).toBeInTheDocument();

      expect(screen.getByRole('heading', { name: 'Languages' })).toBeInTheDocument();
      expect(screen.getByText('2 additional languages')).toBeInTheDocument();

      expect(screen.getByRole('heading', { name: 'Equipment' })).toBeInTheDocument();
      expect(screen.getByText('Shovel, holy symbol, 10 GP')).toBeInTheDocument();

      expect(screen.getByRole('heading', { level: 2, name: 'Features' })).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { level: 3, name: 'Grave Knowledge' })
      ).toBeInTheDocument();
      expect(screen.getByText('You know who is buried where.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 3, name: 'Quiet Company' })).toBeInTheDocument();
      expect(screen.getByText('The night shift never questions you.')).toBeInTheDocument();

      expect(screen.getByRole('heading', { name: 'Personality Traits' })).toBeInTheDocument();
      expect(screen.getByText('I speak softly around strangers.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Ideals' })).toBeInTheDocument();
      expect(screen.getByText('Rest. Everyone has earned it.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Bonds' })).toBeInTheDocument();
      expect(screen.getByText('The parish I served.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Flaws' })).toBeInTheDocument();
      expect(screen.getByText('I answer the dead out loud.')).toBeInTheDocument();
    });

    it('gives every roleplay entry its own list item', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({ data: makeBackground({ ideals: ['Rest.', 'Dignity.'] }) })
      );

      renderPage();

      expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(
        expect.arrayContaining([
          'Rest.',
          'Dignity.',
          'I speak softly around strangers.',
          'The parish I served.',
          'I answer the dead out loud.',
        ])
      );
    });

    it('omits every optional section when the background has none of them', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: BARE }));

      renderPage();

      for (const heading of [
        'Tool Proficiencies',
        'Languages',
        'Equipment',
        'Features',
        'Personality Traits',
        'Ideals',
        'Bonds',
        'Flaws',
      ]) {
        expect(screen.queryByRole('heading', { name: heading })).not.toBeInTheDocument();
      }
      expect(
        screen.queryByText('You turned the earth over the parish dead.')
      ).not.toBeInTheDocument();
      // The header still stands on its own.
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Gravedigger');
    });

    it('writes a single extra language in the singular', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeBackground({ languages: 1 }) }));

      renderPage();

      expect(screen.getByText('1 additional language')).toBeInTheDocument();
    });

    it('drops the features section when the background has an empty feature list', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeBackground({ features: [] }) }));

      renderPage();

      expect(screen.queryByRole('heading', { name: 'Features' })).not.toBeInTheDocument();
      expect(screen.queryByText('You know who is buried where.')).not.toBeInTheDocument();
    });

    it('drops the features section when the payload carries no features at all', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({ data: makeBackground({ features: undefined }) })
      );

      renderPage();

      expect(screen.queryByRole('heading', { name: 'Features' })).not.toBeInTheDocument();
      expect(screen.queryByText('You know who is buried where.')).not.toBeInTheDocument();
    });
  });

  describe('manage controls', () => {
    it('shows Edit and Delete to the owner of a homebrew background', () => {
      authAsOwner();

      renderPage();

      expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
        'href',
        '/srd/backgrounds/bg-1/edit'
      );
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it('shows Edit and Delete to an admin on a shared background', () => {
      authAsAdmin();
      mockUseApiQuery.mockReturnValue(
        queryResult({
          data: makeBackground({ contentSource: 'shared', createdById: 'other-admin' }),
        })
      );

      renderPage();

      expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
        'href',
        '/srd/backgrounds/bg-1/edit'
      );
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it("hides Edit and Delete on another user's homebrew", () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        likelyAuthenticated: true,
        isAdmin: false,
        user: { userId: 'someone-else' },
      });

      renderPage();

      expectNoManageControls();
    });

    it('hides Edit and Delete from a non-admin who created a shared background', () => {
      authAsOwner();
      mockUseApiQuery.mockReturnValue(
        queryResult({ data: makeBackground({ contentSource: 'shared', createdById: 'u1' }) })
      );

      renderPage();

      expectNoManageControls();
    });

    it('hides Edit and Delete on an SRD background, even for an admin', () => {
      authAsAdmin();
      mockUseApiQuery.mockReturnValue(
        queryResult({
          data: makeBackground({
            contentSource: 'srd',
            createdById: null,
            source: 'SRD 5.2.1',
          }),
        })
      );

      renderPage();

      expectNoManageControls();
    });

    it('hides Edit and Delete from an anonymous visitor', () => {
      renderPage();

      expectNoManageControls();
    });

    it('deletes after confirmation, stops reading the background, and leaves before refreshing the list', async () => {
      authAsOwner();
      mockApiFetch.mockResolvedValue(undefined);
      mockInvalidateApiPath.mockResolvedValue(undefined);
      const user = userEvent.setup();

      renderPage();
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(screen.getByText('Delete background?')).toBeInTheDocument();
      expect(
        screen.getByText('"Gravedigger" will be permanently deleted. This cannot be undone.')
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Delete background' }));

      // The mock still returns the background, so this view shows the page stopped
      // reading the query.
      expect(await screen.findByText('Background deleted.')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
      await waitFor(() => {
        expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/backgrounds');
      });
      expect(mockApiFetch).toHaveBeenCalledWith('/srd/backgrounds/bg-1', { method: 'DELETE' });
      expect(mockToast.success).toHaveBeenCalledWith('Deleted Gravedigger');
      expect(mockPush).toHaveBeenCalledWith('/srd/backgrounds');
      expect(mockRemoveQueries).toHaveBeenCalledWith({
        queryKey: ['api', '/srd/backgrounds/bg-1'],
        exact: true,
      });
      expect(mockUseApiQuery.mock.lastCall?.[1]).toMatchObject({ enabled: false });
      // The navigation and the cache removal both come before the list refresh.
      expect(mockPush.mock.invocationCallOrder[0]).toBeLessThan(
        mockInvalidateApiPath.mock.invocationCallOrder[0]
      );
      expect(mockRemoveQueries.mock.invocationCallOrder[0]).toBeLessThan(
        mockInvalidateApiPath.mock.invocationCallOrder[0]
      );
    });

    it('toasts a delete Error and stays on the page', async () => {
      authAsOwner();
      mockApiFetch.mockRejectedValue(new Error('This background is in use by 2 characters.'));

      renderPage();
      await confirmDelete();

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('This background is in use by 2 characters.');
      });
      expect(mockToast.success).not.toHaveBeenCalled();
      expect(mockRemoveQueries).not.toHaveBeenCalled();
      expect(mockInvalidateApiPath).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.queryByText('Background deleted.')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Gravedigger');
    });

    it('toasts fallback copy for a non-Error delete rejection', async () => {
      authAsOwner();
      mockApiFetch.mockRejectedValue('boom');

      renderPage();
      await confirmDelete();

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to delete background');
      });
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
