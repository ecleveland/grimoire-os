import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClassDetailPage from '../page';
import { PrintTrayProvider } from '@/lib/print-tray-context';
import type { SrdClass, SrdSubclass } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

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

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'class-hb' }),
  useRouter: () => ({ push: mockPush }),
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

type ClassWithSubclasses = SrdClass & { subclasses?: SrdSubclass[] };

const DEADEYE: SrdSubclass = {
  id: 'sc-deadeye',
  name: 'Deadeye',
  classId: 'class-hb',
  description: 'A patient marksman.',
  source: 'Homebrew',
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

async function expectNotFoundWithRetry() {
  const user = userEvent.setup();

  expect(screen.getByText('Class not found.')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to classes' })).toHaveAttribute(
    'href',
    '/srd/classes'
  );
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
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
    it('fetches /srd/classes/class-hb', () => {
      renderPage();

      expect(mockUseApiQuery).toHaveBeenCalledWith('/srd/classes/class-hb');
    });

    it('renders a loading state while the class is in flight', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: undefined, isLoading: true }));

      renderPage();

      expect(screen.getByText('Loading class…')).toBeInTheDocument();
    });

    it('shows the not-found state with Retry and a way back when the fetch fails', async () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: undefined, isError: true }));

      renderPage();

      await expectNotFoundWithRetry();
    });

    it('shows the same not-found state when the class is null', async () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: null }));

      renderPage();

      await expectNotFoundWithRetry();
    });

    it('disables Retry while a refetch is in flight', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({ data: undefined, isError: true, isFetching: true })
      );

      renderPage();

      expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled();
    });

    it('keeps a loaded class on screen when a background refetch fails', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeClass(), isError: true }));

      renderPage();

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Gunslinger');
      expect(screen.queryByText('Class not found.')).not.toBeInTheDocument();
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
      expect(screen.getByRole('button', { name: 'Add Grit to print set' })).toBeInTheDocument();
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

    it('shows no subclasses section when subclasses is absent', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: makeClass({ subclasses: undefined }) }));

      renderPage();

      expect(screen.queryByRole('heading', { name: 'Subclasses' })).not.toBeInTheDocument();
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

    it('hides Edit and Delete while auth is still hydrating', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: true,
        likelyAuthenticated: true,
        isAdmin: false,
        user: null,
      });

      renderPage();

      expectNoManageControls();
    });

    it('deletes after confirmation, returns to the list, then invalidates the classes cache', async () => {
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

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/srd/classes');
      });
      expect(mockApiFetch).toHaveBeenCalledWith('/srd/classes/class-hb', { method: 'DELETE' });
      expect(mockToast.success).toHaveBeenCalledWith('Deleted Gunslinger');
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/classes');
      // The page leaves before the refresh, which would otherwise refetch this deleted class.
      expect(mockPush.mock.invocationCallOrder[0]).toBeLessThan(
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
      expect(mockInvalidateApiPath).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
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
