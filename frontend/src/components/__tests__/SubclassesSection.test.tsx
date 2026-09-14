import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubclassesSection from '@/components/SubclassesSection';
import { PrintTrayProvider } from '@/lib/print-tray-context';
import type { SrdClass, SrdSubclass } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockInvalidateApiPath = vi.fn();
vi.mock('@/lib/query', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/query')>()),
  invalidateApiPath: (...args: unknown[]) => mockInvalidateApiPath(...args),
}));

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({}),
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
    id: 'cls-hb',
    name: 'Gunslinger',
    contentSource: 'homebrew',
    createdById: 'u1',
    hitDie: 'd8',
    primaryAbilities: ['DEX'],
    savingThrows: ['DEX'],
    armorProficiencies: [],
    weaponProficiencies: [],
    skillChoices: [],
    toolProficiencies: [],
    numSkillChoices: 0,
    features: [],
    subclassLevel: 3,
    source: 'Homebrew',
    ...over,
  };
}

function makeSubclass(over: Partial<SrdSubclass> = {}): SrdSubclass {
  return {
    id: 'sc-deadeye',
    name: 'Deadeye',
    classId: 'cls-hb',
    description: 'A patient marksman.',
    features: [{ id: 'cf-aim', name: 'Steady Aim', level: 3 }],
    source: 'Homebrew',
    contentSource: 'homebrew',
    createdById: 'u1',
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

function authAs(userId: string, isAdmin = false) {
  mockUseAuth.mockReturnValue({
    isAuthenticated: true,
    isLoading: false,
    likelyAuthenticated: true,
    isAdmin,
    user: { userId },
  });
}

function renderSection(subclasses: SrdSubclass[], cls: SrdClass = makeClass()) {
  return render(
    <PrintTrayProvider>
      <SubclassesSection cls={cls} subclasses={subclasses} />
    </PrintTrayProvider>
  );
}

/**
 * A subclass's card heading. Matched as a prefix because the Homebrew badge sits
 * inside the h3, so the accessible name of a homebrew row is "DeadeyeHomebrew".
 */
function headingFor(name: string) {
  return screen.getByRole('heading', { level: 3, name: new RegExp(`^${name}`) });
}

function queryHeadingFor(name: string) {
  return screen.queryByRole('heading', { level: 3, name: new RegExp(`^${name}`) });
}

/** The card a subclass renders into, found by its heading. */
function cardFor(name: string): HTMLElement {
  return headingFor(name).closest('li') as HTMLElement;
}

/** Open the create form and fill in a name. */
async function startCreate(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'Add subclass' }));
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: name } });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SubclassesSection', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    anon();
    mockApiFetch.mockResolvedValue({});
    mockInvalidateApiPath.mockResolvedValue(undefined);
  });

  describe('what each visitor sees', () => {
    it('renders nothing for an anonymous visitor when the class has no subclasses', () => {
      const { container } = renderSection([]);

      expect(container).toBeEmptyDOMElement();
    });

    it('renders the list without any controls for an anonymous visitor', () => {
      renderSection([makeSubclass()]);

      expect(screen.getByRole('heading', { level: 2, name: 'Subclasses' })).toBeInTheDocument();
      expect(headingFor('Deadeye')).toBeInTheDocument();
      expect(screen.getByText('A patient marksman.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add subclass' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    it('shows the heading and Add to a signed-in visitor when the class has none', () => {
      authAs('u2');

      renderSection([]);

      expect(screen.getByRole('heading', { level: 2, name: 'Subclasses' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add subclass' })).toBeInTheDocument();
    });

    it('shows the level line only when the class sets one', () => {
      renderSection([makeSubclass()]);
      expect(screen.getByText('Chosen at level 3.')).toBeInTheDocument();

      renderSection([makeSubclass()], makeClass({ subclassLevel: undefined }));
      expect(screen.queryAllByText(/Chosen at level/)).toHaveLength(1);
    });

    it('badges a homebrew subclass and its features as print chips', () => {
      renderSection([makeSubclass()]);

      expect(within(cardFor('Deadeye')).getByText('Homebrew')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Add Steady Aim to print set' })
      ).toBeInTheDocument();
    });

    it('renders a subclass with no description and no features', () => {
      renderSection([makeSubclass({ description: undefined, features: undefined })]);

      expect(headingFor('Deadeye')).toBeInTheDocument();
      expect(screen.queryByText('A patient marksman.')).not.toBeInTheDocument();
    });

    it('leaves an SRD subclass unbadged', () => {
      renderSection([
        makeSubclass({ contentSource: 'srd', createdById: null, source: 'SRD 5.2.1' }),
      ]);

      expect(screen.queryByText('Homebrew')).not.toBeInTheDocument();
    });
  });

  describe('who may manage a row', () => {
    it('shows Edit and Delete to the owner of a homebrew subclass', () => {
      authAs('u1');

      renderSection([makeSubclass()]);

      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    });

    it("hides both on another user's homebrew subclass", () => {
      authAs('stranger');

      renderSection([makeSubclass()]);

      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      // A stranger may still add their own subclass under this class.
      expect(screen.getByRole('button', { name: 'Add subclass' })).toBeInTheDocument();
    });

    it('shows both to an admin on a shared subclass but not on an SRD one', () => {
      authAs('admin-1', true);

      renderSection([
        makeSubclass({ id: 'sc-shared', name: 'Sharpshooter', contentSource: 'shared' }),
        makeSubclass({ id: 'sc-srd', name: 'Champion', contentSource: 'srd', createdById: null }),
      ]);

      expect(within(cardFor('Sharpshooter')).getByRole('button', { name: 'Edit' })).toBeVisible();
      expect(
        within(cardFor('Champion')).queryByRole('button', { name: 'Edit' })
      ).not.toBeInTheDocument();
    });
  });

  describe('creating', () => {
    it('sends the payload with the parent classId, toasts, and refreshes both lists', async () => {
      authAs('u2');
      const user = userEvent.setup();

      renderSection([]);
      await startCreate(user, 'Deadeye');
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Patient.' } });
      await user.click(screen.getByRole('button', { name: 'Create subclass' }));

      await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Created Deadeye'));
      expect(mockApiFetch).toHaveBeenCalledWith('/srd/subclasses', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Deadeye',
          description: 'Patient.',
          features: [],
          classId: 'cls-hb',
        }),
      });
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/classes/cls-hb');
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/subclasses');
      // The form closes once the write lands.
      expect(screen.queryByRole('button', { name: 'Create subclass' })).not.toBeInTheDocument();
    });

    it('closes the form without writing anything when cancelled', async () => {
      authAs('u2');
      const user = userEvent.setup();

      renderSection([]);
      await user.click(screen.getByRole('button', { name: 'Add subclass' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.getByRole('button', { name: 'Add subclass' })).toBeInTheDocument();
      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('toasts an Error message from a failed create and refreshes nothing', async () => {
      authAs('u2');
      mockApiFetch.mockRejectedValue(new Error('A subclass of this class already has that name'));
      const user = userEvent.setup();

      renderSection([]);
      await startCreate(user, 'Deadeye');
      await user.click(screen.getByRole('button', { name: 'Create subclass' }));

      await waitFor(() =>
        expect(mockToast.error).toHaveBeenCalledWith(
          'A subclass of this class already has that name'
        )
      );
      expect(mockInvalidateApiPath).not.toHaveBeenCalled();
      expect(mockToast.success).not.toHaveBeenCalled();
      // The form stays open with the author's work in it.
      expect(screen.getByLabelText(/^Name/)).toHaveValue('Deadeye');
    });

    it('toasts fallback copy for a non-Error create rejection', async () => {
      authAs('u2');
      mockApiFetch.mockRejectedValue('boom');
      const user = userEvent.setup();

      renderSection([]);
      await startCreate(user, 'Deadeye');
      await user.click(screen.getByRole('button', { name: 'Create subclass' }));

      await waitFor(() =>
        expect(mockToast.error).toHaveBeenCalledWith('Failed to create subclass')
      );
      expect(mockInvalidateApiPath).not.toHaveBeenCalled();
    });

    it('disables the submit button while the create is in flight', async () => {
      authAs('u2');
      mockApiFetch.mockReturnValue(new Promise(() => {}));
      const user = userEvent.setup();

      renderSection([]);
      await startCreate(user, 'Deadeye');
      await user.click(screen.getByRole('button', { name: 'Create subclass' }));

      expect(await screen.findByRole('button', { name: 'Saving...' })).toBeDisabled();
    });
  });

  describe('editing', () => {
    it('replaces the card with a prefilled form and PATCHes without a classId', async () => {
      authAs('u1');
      const user = userEvent.setup();

      renderSection([makeSubclass()]);
      await user.click(screen.getByRole('button', { name: 'Edit' }));

      expect(queryHeadingFor('Deadeye')).not.toBeInTheDocument();
      expect(screen.getByLabelText(/^Name/)).toHaveValue('Deadeye');
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Reworded.' } });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Updated Deadeye'));
      expect(mockApiFetch).toHaveBeenCalledWith('/srd/subclasses/sc-deadeye', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Deadeye', description: 'Reworded.' }),
      });
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/classes/cls-hb');
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/subclasses');
    });

    it('toasts a failed edit and leaves the form open', async () => {
      authAs('u1');
      mockApiFetch.mockRejectedValue(new Error('Nope'));
      const user = userEvent.setup();

      renderSection([makeSubclass()]);
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Reworded.' } });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Nope'));
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    });
  });

  // An open form holds an unsaved draft in its own state, so every other control
  // that would unmount it is withdrawn while it is open. Save and Cancel are the
  // only ways out.
  describe('guarding an open form', () => {
    const twoRows = () => [makeSubclass(), makeSubclass({ id: 'sc-sharp', name: 'Sharpshooter' })];

    function expectNoRowControls() {
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    }

    it('withdraws Add and the other rows controls while an edit is open', async () => {
      authAs('u1');
      const user = userEvent.setup();

      renderSection(twoRows());
      await user.click(within(cardFor('Deadeye')).getByRole('button', { name: 'Edit' }));

      expect(screen.queryByRole('button', { name: 'Add subclass' })).not.toBeInTheDocument();
      // Only Sharpshooter still renders as a card, and it offers nothing.
      expectNoRowControls();
      expect(headingFor('Sharpshooter')).toBeInTheDocument();
    });

    it('withdraws the row controls while the create form is open', async () => {
      authAs('u1');
      const user = userEvent.setup();

      renderSection(twoRows());
      await user.click(screen.getByRole('button', { name: 'Add subclass' }));

      expect(screen.queryByRole('button', { name: 'Add subclass' })).not.toBeInTheDocument();
      expectNoRowControls();
    });

    it('brings every control back when the form is cancelled', async () => {
      authAs('u1');
      const user = userEvent.setup();

      renderSection(twoRows());
      await user.click(within(cardFor('Deadeye')).getByRole('button', { name: 'Edit' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.getByRole('button', { name: 'Add subclass' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
      expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
    });

    it('brings every control back after a successful save', async () => {
      authAs('u1');
      const user = userEvent.setup();

      renderSection(twoRows());
      await user.click(within(cardFor('Deadeye')).getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Reworded.' } });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Add subclass' })).toBeInTheDocument()
      );
      expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    });

    // The one way a delete and an open form overlap: the confirm dialog closes as
    // soon as it is confirmed, so the row controls are live again while the
    // request is still in flight. A delete must never close a form it didn't open.
    it('keeps an edit opened during an in-flight delete mounted when the delete lands', async () => {
      authAs('u1');
      let settleDelete = () => {};
      mockApiFetch.mockReturnValue(
        new Promise<void>(resolve => {
          settleDelete = resolve;
        })
      );
      const user = userEvent.setup();

      renderSection(twoRows());
      await user.click(within(cardFor('Sharpshooter')).getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete subclass' }));

      await user.click(within(cardFor('Deadeye')).getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Half written.' },
      });

      settleDelete();

      await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Deleted Sharpshooter'));
      expect(screen.getByLabelText('Description')).toHaveValue('Half written.');
    });
  });

  describe('deleting', () => {
    it('confirms, then sends the DELETE and refreshes both lists', async () => {
      authAs('u1');
      const user = userEvent.setup();

      renderSection([makeSubclass()]);
      await user.click(screen.getByRole('button', { name: 'Delete' }));

      expect(screen.getByText('Delete subclass?')).toBeInTheDocument();
      expect(
        screen.getByText('"Deadeye" will be permanently deleted. This cannot be undone.')
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Delete subclass' }));

      await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Deleted Deadeye'));
      expect(mockApiFetch).toHaveBeenCalledWith('/srd/subclasses/sc-deadeye', {
        method: 'DELETE',
      });
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/classes/cls-hb');
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/subclasses');
    });

    it('writes nothing when the confirmation is cancelled', async () => {
      authAs('u1');
      const user = userEvent.setup();

      renderSection([makeSubclass()]);
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(mockApiFetch).not.toHaveBeenCalled();
      expect(headingFor('Deadeye')).toBeInTheDocument();
    });

    it('toasts fallback copy for a non-Error delete rejection', async () => {
      authAs('u1');
      mockApiFetch.mockRejectedValue('boom');
      const user = userEvent.setup();

      renderSection([makeSubclass()]);
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete subclass' }));

      await waitFor(() =>
        expect(mockToast.error).toHaveBeenCalledWith('Failed to delete subclass')
      );
      expect(mockInvalidateApiPath).not.toHaveBeenCalled();
    });
  });
});
