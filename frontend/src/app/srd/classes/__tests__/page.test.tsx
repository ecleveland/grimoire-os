import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClassListPage from '../page';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
import type { SrdClass } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

// The list rides the credentialed useApiQuery so the caller's homebrew appears;
// deletes go through apiFetch.
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

function makeClass(over: Partial<SrdClass> = {}): SrdClass {
  return {
    id: 'class-1',
    name: 'Fighter',
    contentSource: 'srd',
    createdById: null,
    hitDie: 'd10',
    primaryAbilities: ['STR'],
    savingThrows: ['STR', 'CON'],
    armorProficiencies: ['All armor'],
    weaponProficiencies: ['Simple', 'Martial'],
    skillChoices: ['Athletics', 'Intimidation'],
    toolProficiencies: [],
    numSkillChoices: 2,
    features: [
      { id: 'cf-second-wind', name: 'Second Wind', level: 1, description: 'Regain hit points.' },
      { id: 'cf-action-surge', name: 'Action Surge', level: 2, description: 'Extra action.' },
    ],
    source: 'SRD 5.2.1',
    ...over,
  };
}

const HOMEBREW = makeClass({
  id: 'class-hb',
  name: 'Gunslinger',
  contentSource: 'homebrew',
  createdById: 'u1',
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
  return { data: [makeClass()], isLoading: false, isError: false, ...over };
}

function renderPage() {
  return render(
    <PrintTrayProvider>
      <ClassListPage />
    </PrintTrayProvider>
  );
}

/** The persisted tray contents, for asserting tray state after a toggle. */
function storedTray(): unknown {
  return JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY) ?? '[]');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ClassListPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    anon();
    mockUseApiQuery.mockReturnValue(queryResult());
  });

  describe('rendering', () => {
    it('fetches /srd/classes and renders the list', () => {
      renderPage();

      expect(mockUseApiQuery).toHaveBeenCalledWith('/srd/classes');
      expect(screen.getByText('Fighter')).toBeInTheDocument();
      expect(screen.getByText(/Hit Die: d10/)).toBeInTheDocument();
    });

    it('shows the ability separator only when a class has primary abilities', () => {
      mockUseApiQuery.mockReturnValue(
        queryResult({
          data: [
            makeClass(),
            makeClass({ id: 'class-2', name: 'Wanderer', hitDie: 'd8', primaryAbilities: [] }),
          ],
        })
      );

      renderPage();

      expect(screen.getByText(/^Hit Die: d10/)).toHaveTextContent(/^Hit Die: d10 · STR$/);
      expect(screen.getByText(/^Hit Die: d8/)).toHaveTextContent(/^Hit Die: d8$/);
    });

    it('renders a loading state while the list is in flight', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: undefined, isLoading: true }));

      renderPage();

      expect(screen.getByText('Loading classes…')).toBeInTheDocument();
    });

    it('renders an error state when the fetch rejects', () => {
      mockUseApiQuery.mockReturnValue(queryResult({ data: undefined, isError: true }));

      renderPage();

      expect(
        screen.getByText('Failed to load classes. Please try again later.')
      ).toBeInTheDocument();
    });

    it('links each card to its class page, for anonymous visitors too', async () => {
      const user = userEvent.setup();

      renderPage();
      await user.click(screen.getByRole('button', { name: /Fighter/, expanded: false }));

      expect(screen.getByRole('link', { name: 'Open class page' })).toHaveAttribute(
        'href',
        '/srd/classes/class-1'
      );
    });
  });

  describe('homebrew classes', () => {
    it('shows the create link to authenticated users', () => {
      authAsOwner();

      renderPage();

      expect(screen.getByRole('link', { name: 'Create class' })).toHaveAttribute(
        'href',
        '/srd/classes/new'
      );
    });

    it('hides the create link from anonymous visitors', () => {
      renderPage();

      expect(screen.queryByRole('link', { name: 'Create class' })).not.toBeInTheDocument();
    });

    it('badges homebrew rows and not SRD rows', () => {
      authAsOwner();
      mockUseApiQuery.mockReturnValue(queryResult({ data: [makeClass(), HOMEBREW] }));

      renderPage();

      // getByText throws on a second match, so this also proves the SRD row is unbadged.
      expect(screen.getByText('Homebrew').closest('h2')).toHaveTextContent('Gunslinger');
    });

    it('shows Edit and Delete for the owner of a homebrew class', async () => {
      authAsOwner();
      mockUseApiQuery.mockReturnValue(queryResult({ data: [HOMEBREW] }));
      const user = userEvent.setup();

      renderPage();
      // The manage controls live in the card body, revealed on expand.
      await user.click(screen.getByRole('button', { name: /Gunslinger/, expanded: false }));

      expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
        'href',
        '/srd/classes/class-hb/edit'
      );
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Open class page' })).toHaveAttribute(
        'href',
        '/srd/classes/class-hb'
      );
    });

    it('shows no Edit/Delete on SRD rows, even for admins', async () => {
      authAsAdmin();
      const user = userEvent.setup();

      renderPage();
      await user.click(screen.getByRole('button', { name: /Fighter/, expanded: false }));

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
      await user.click(screen.getByRole('button', { name: /Gunslinger/, expanded: false }));

      expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    it('lets an admin manage shared classes', async () => {
      authAsAdmin();
      mockUseApiQuery.mockReturnValue(
        queryResult({ data: [makeClass({ contentSource: 'shared', createdById: 'other-admin' })] })
      );
      const user = userEvent.setup();

      renderPage();
      await user.click(screen.getByRole('button', { name: /Fighter/, expanded: false }));

      expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
        'href',
        '/srd/classes/class-1/edit'
      );
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it('deletes after confirmation and invalidates the list', async () => {
      authAsOwner();
      mockUseApiQuery.mockReturnValue(queryResult({ data: [HOMEBREW] }));
      mockApiFetch.mockResolvedValue(undefined);
      const user = userEvent.setup();

      renderPage();

      await user.click(screen.getByRole('button', { name: /Gunslinger/, expanded: false }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete class' }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('/srd/classes/class-hb', { method: 'DELETE' });
      });
      expect(mockToast.success).toHaveBeenCalledWith('Deleted Gunslinger');
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/classes');
    });

    it('surfaces a delete failure as an error toast', async () => {
      authAsOwner();
      mockUseApiQuery.mockReturnValue(queryResult({ data: [HOMEBREW] }));
      mockApiFetch.mockRejectedValue(
        new Error('This class still has 1 subclass. Delete it first.')
      );
      const user = userEvent.setup();

      renderPage();

      await user.click(screen.getByRole('button', { name: /Gunslinger/, expanded: false }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete class' }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          'This class still has 1 subclass. Delete it first.'
        );
      });
      expect(mockToast.success).not.toHaveBeenCalled();
      expect(mockInvalidateApiPath).not.toHaveBeenCalled();
    });

    it('surfaces a non-Error delete rejection with fallback copy', async () => {
      authAsOwner();
      mockUseApiQuery.mockReturnValue(queryResult({ data: [HOMEBREW] }));
      mockApiFetch.mockRejectedValue('boom');
      const user = userEvent.setup();

      renderPage();

      await user.click(screen.getByRole('button', { name: /Gunslinger/, expanded: false }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete class' }));

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Failed to delete class');
      });
    });
  });

  // The chip rendering and keying rules are covered in ClassDetail.test.tsx;
  // this checks that the list wires a card's chips to the print tray.
  describe('print set selection', () => {
    it('toggles a feature chip into the tray and back out', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: /^Fighter/ }));
      await user.click(screen.getByRole('button', { name: 'Add Action Surge to print set' }));

      expect(storedTray()).toEqual([{ type: 'feature', id: 'cf-action-surge' }]);
      expect(
        screen.getByRole('button', { name: 'Remove Action Surge from print set' })
      ).toHaveAttribute('aria-pressed', 'true');

      await user.click(screen.getByRole('button', { name: 'Remove Action Surge from print set' }));

      expect(storedTray()).toEqual([]);
    });
  });

  // An id-less feature can't be a print toggle. Real API data always carries
  // feature row ids, so one appearing signals a broken backend contract that
  // would otherwise drop print toggles without anyone noticing.
  describe('inert-chip invariant logging', () => {
    const invariantLogs = (spy: ReturnType<typeof vi.spyOn>) =>
      spy.mock.calls.filter((call: unknown[]) =>
        String(call[0]).includes('class features rendered without an id')
      );

    it('logs a contract-violation error when a feature is rendered without an id', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockUseApiQuery.mockReturnValue(
        queryResult({
          data: [
            makeClass({
              features: [
                { id: 'cf-second-wind', name: 'Second Wind', level: 1 },
                { name: 'Legacy Feature', level: 1 },
              ],
            }),
          ],
        })
      );

      renderPage();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('class features rendered without an id'),
        ['Legacy Feature']
      );
      errorSpy.mockRestore();
    });

    it('does not log the invariant when every feature carries an id', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      renderPage();

      expect(errorSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('without an id'),
        expect.anything()
      );
      errorSpy.mockRestore();
    });

    it('logs the invariant once per payload, not once per render', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      authAsOwner();
      mockUseApiQuery.mockReturnValue(
        queryResult({ data: [{ ...HOMEBREW, features: [{ name: 'Legacy Feature', level: 1 }] }] })
      );
      const user = userEvent.setup();

      renderPage();
      // Opening the delete dialog sets page state, so the page renders again
      // with the same payload.
      await user.click(screen.getByRole('button', { name: /Gunslinger/, expanded: false }));
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      expect(screen.getByRole('button', { name: 'Delete class' })).toBeInTheDocument();

      expect(invariantLogs(errorSpy)).toHaveLength(1);
      errorSpy.mockRestore();
    });
  });
});
