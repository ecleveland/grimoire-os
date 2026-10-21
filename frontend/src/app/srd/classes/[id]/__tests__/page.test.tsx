import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClassDetailPage from '../page';
import { PrintTrayProvider } from '@/lib/print-tray-context';
import type { SrdClass, SrdSubclass } from '@/lib/types';

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
  useParams: () => ({ id: 'class-hb' }),
  useRouter: () => ({ push: mockPush }),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

type ClassWithSubclasses = SrdClass & { subclasses?: SrdSubclass[] };

// Deliberately an SRD row: nobody may manage it, so the Edit and Delete controls
// on this page are unambiguously the class's own. SubclassesSection's own spec
// covers who may manage a subclass.
const DEADEYE: SrdSubclass = {
  id: 'sc-deadeye',
  name: 'Deadeye',
  classId: 'class-hb',
  description: 'A patient marksman.',
  source: 'SRD 5.2.1',
  contentSource: 'srd',
  createdById: null,
};

function makeClass(over: Partial<ClassWithSubclasses> = {}): ClassWithSubclasses {
  return {
    id: 'class-hb',
    name: 'Gunslinger',
    contentSource: 'homebrew',
    createdById: 'u1',
    hitDie: 'd8',
    primaryAbilities: ['DEX'],
    savingThrows: ['DEX', 'CHA'],
    armorProficiencies: ['Light armor'],
    weaponProficiencies: ['Simple', 'Firearms'],
    skillChoices: ['Acrobatics', 'Perception'],
    toolProficiencies: [],
    numSkillChoices: 2,
    features: [{ id: 'cf-grit', name: 'Grit', level: 1 }],
    subclassLevel: 3,
    subclasses: [DEADEYE],
    source: 'Homebrew',
    ...over,
  };
}

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
    data: makeClass(),
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
      <ClassDetailPage />
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
  await user.click(screen.getByRole('button', { name: 'Delete class' }));
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ClassDetailPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    anon();
    mockUseApiQuery.mockReturnValue(queryResult());
  });

  describe('loading and errors', () => {
    it('fetches /srd/classes/class-hb with the load-failure toast', () => {
      renderPage();

      expect(mockUseApiQuery).toHaveBeenCalledWith(
        '/srd/classes/class-hb',
        expect.objectContaining({
          errorToast: { message: 'Failed to load class', id: 'load-class' },
          enabled: true,
        })
      );
    });

    it('renders a loading state while the class is in flight', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: undefined, isLoading: true }));

      renderPage();

      expect(screen.getByText('Loading class…')).toBeInTheDocument();
    });

    it('shows the load-failure state with Retry when the fetch fails before a class loads', async () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: undefined, isError: true }));
      const user = userEvent.setup();

      renderPage();

      expect(screen.getByText('Failed to load class.')).toBeInTheDocument();
      expect(screen.queryByText('Class not found.')).not.toBeInTheDocument();
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

    it('shows the not-found state without Retry when the class is null', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: null }));

      renderPage();

      expect(screen.getByText('Class not found.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to classes' })).toHaveAttribute(
        'href',
        '/srd/classes'
      );
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
      expect(screen.queryByText('Failed to load class.')).not.toBeInTheDocument();
    });

    it('keeps a loaded class on screen when a background refetch fails', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeClass(), isError: true }));

      renderPage();

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Gunslinger');
      expect(screen.queryByText('Class not found.')).not.toBeInTheDocument();
      expect(screen.queryByText('Failed to load class.')).not.toBeInTheDocument();
    });
  });

  describe('loaded class', () => {
    it('renders the header, the class sections and the subclasses', () => {
      renderPage();

      expect(screen.getByRole('link', { name: '← Classes' })).toHaveAttribute(
        'href',
        '/srd/classes'
      );
      const title = screen.getByRole('heading', { level: 1 });
      expect(title).toHaveTextContent('Gunslinger');
      expect(within(title).getByText('Homebrew')).toBeInTheDocument();
      expect(screen.getByText('Hit Die: d8 · DEX')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Saving Throws' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add Grit to print set' })).toBeVisible();
      expect(screen.getByRole('heading', { level: 2, name: 'Subclasses' })).toBeInTheDocument();
      expect(screen.getByText('Chosen at level 3.')).toBeInTheDocument();
      expect(screen.getByText('Deadeye')).toBeInTheDocument();
      expect(screen.getByText('A patient marksman.')).toBeInTheDocument();
    });

    it('leaves the separator off the hit die line when the class has no primary abilities', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeClass({ primaryAbilities: [] }) }));

      renderPage();

      expect(screen.getByText(/^Hit Die:/)).toHaveTextContent(/^Hit Die: d8$/);
    });

    it('omits the level line and a missing subclass description', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({
          data: makeClass({
            subclassLevel: undefined,
            subclasses: [{ ...DEADEYE, description: undefined }],
          }),
        })
      );

      renderPage();

      expect(screen.getByRole('heading', { name: 'Subclasses' })).toBeInTheDocument();
      expect(screen.getByText('Deadeye')).toBeInTheDocument();
      expect(screen.queryByText(/Chosen at level/)).not.toBeInTheDocument();
      expect(screen.queryByText('A patient marksman.')).not.toBeInTheDocument();
    });

    it('shows no subclasses section when the class has none', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeClass({ subclasses: [] }) }));

      renderPage();

      expect(screen.queryByRole('heading', { name: 'Subclasses' })).not.toBeInTheDocument();
      expect(screen.queryByText(/Chosen at level/)).not.toBeInTheDocument();
    });

    it('offers Add subclass to a signed-in visitor on a class with none', () => {
      authAsOwner();
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeClass({ subclasses: [] }) }));

      renderPage();

      expect(screen.getByRole('heading', { name: 'Subclasses' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add subclass' })).toBeInTheDocument();
    });

    it('shows no subclasses section when subclasses is absent', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeClass({ subclasses: undefined }) }));

      renderPage();

      expect(screen.queryByRole('heading', { name: 'Subclasses' })).not.toBeInTheDocument();
    });
  });

  // A feature search hit links to /srd/classes/<classId>#<featureId>, and the
  // class arrives after the navigation, so the page scrolls once it renders.
  // useScrollToHash's own spec covers the once-per-hash and bad-hash rules.
  describe('scrolling to a linked feature', () => {
    // jsdom has no scrollIntoView, so there is nothing to spy on: install one,
    // and put the absence back afterwards the way the encounter page spec does.
    const scrollIntoView = vi.fn();

    beforeEach(() => {
      (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollIntoView;
    });

    afterEach(() => {
      delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
      window.location.hash = '';
    });

    it('scrolls the class feature row the hash names into view once the class loads', () => {
      window.location.hash = '#cf-grit';
      mockUseApiQuery.mockReturnValue(queryResult({ data: undefined, isLoading: true }));
      const { rerender } = renderPage();
      expect(scrollIntoView).not.toHaveBeenCalled();

      mockUseApiQuery.mockReturnValue(queryResult());
      rerender(
        <PrintTrayProvider>
          <ClassDetailPage />
        </PrintTrayProvider>
      );

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(document.getElementById('cf-grit'));
      expect(document.getElementById('cf-grit')).toHaveTextContent('Grit');
    });

    it('scrolls a subclass feature row into view', () => {
      window.location.hash = '#cf-dead-aim';
      mockUseApiQuery.mockReturnValue(
        queryResult({
          data: makeClass({
            subclasses: [
              { ...DEADEYE, features: [{ id: 'cf-dead-aim', name: 'Dead Aim', level: 3 }] },
            ],
          }),
        })
      );

      renderPage();

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(document.getElementById('cf-dead-aim'));
    });

    it('scrolls a subclass card into view', () => {
      window.location.hash = '#sc-deadeye';

      renderPage();

      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      expect(scrollIntoView.mock.instances[0]).toBe(document.getElementById('sc-deadeye'));
    });
  });

  describe('manage controls', () => {
    it('shows Edit and Delete to the owner of a homebrew class', () => {
      authAsOwner();

      renderPage();

      expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
        'href',
        '/srd/classes/class-hb/edit'
      );
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it('shows Edit and Delete to an admin on a shared class', () => {
      authAsAdmin();
      mockUseApiQuery.mockReturnValue(
        queryResult({ data: makeClass({ contentSource: 'shared', createdById: 'other-admin' }) })
      );

      renderPage();

      expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
        'href',
        '/srd/classes/class-hb/edit'
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

    it('hides Edit and Delete from a non-admin who created a shared class', () => {
      authAsOwner();
      mockUseApiQuery.mockReturnValue(
        queryResult({ data: makeClass({ contentSource: 'shared', createdById: 'u1' }) })
      );

      renderPage();

      expectNoManageControls();
    });

    it('hides Edit and Delete on an SRD class, even for an admin', () => {
      authAsAdmin();
      mockUseApiQuery.mockReturnValue(
        queryResult({
          data: makeClass({ contentSource: 'srd', createdById: null, source: 'SRD 5.2.1' }),
        })
      );

      renderPage();

      expectNoManageControls();
      expect(screen.queryByText('Homebrew')).not.toBeInTheDocument();
    });

    it('hides Edit and Delete from an anonymous visitor', () => {
      renderPage();

      expectNoManageControls();
    });

    it('deletes after confirmation, stops reading the class, and leaves before refreshing the list', async () => {
      authAsOwner();
      mockApiFetch.mockResolvedValue(undefined);
      mockInvalidateApiPath.mockResolvedValue(undefined);
      const user = userEvent.setup();

      renderPage();
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(screen.getByText('Delete class?')).toBeInTheDocument();
      expect(
        screen.getByText('"Gunslinger" will be permanently deleted. This cannot be undone.')
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Delete class' }));

      // The mock still returns the class, so this view shows the page stopped reading the query.
      expect(await screen.findByText('Class deleted.')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
      await waitFor(() => {
        expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/classes');
      });
      expect(mockApiFetch).toHaveBeenCalledWith('/srd/classes/class-hb', { method: 'DELETE' });
      expect(mockToast.success).toHaveBeenCalledWith('Deleted Gunslinger');
      expect(mockPush).toHaveBeenCalledWith('/srd/classes');
      expect(mockRemoveQueries).toHaveBeenCalledWith({
        queryKey: ['api', '/srd/classes/class-hb'],
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
      mockApiFetch.mockRejectedValue(
        new Error('This class still has 1 subclass. Delete it first.')
      );

      renderPage();
      await confirmDelete();

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          'This class still has 1 subclass. Delete it first.'
        );
      });
      expect(mockToast.success).not.toHaveBeenCalled();
      expect(mockRemoveQueries).not.toHaveBeenCalled();
      expect(mockInvalidateApiPath).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.queryByText('Class deleted.')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Gunslinger');
    });

    it('toasts fallback copy for a non-Error delete rejection', async () => {
      authAsOwner();
      mockApiFetch.mockRejectedValue('boom');

      renderPage();
      await confirmDelete();

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to delete class');
      });
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
