import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubclassesSection from '@/components/SubclassesSection';
import { ApiError } from '@/lib/api';
import { PrintTrayProvider } from '@/lib/print-tray-context';
import type { SrdClass, SrdSubclass } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
// The real module stays, so a test can reject with a genuine ApiError and the
// component's `instanceof` check sees the same class.
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
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

function hydrating(likelyAuthenticated: boolean) {
  mockUseAuth.mockReturnValue({
    isAuthenticated: false,
    isLoading: true,
    likelyAuthenticated,
    isAdmin: false,
    user: null,
  });
}

function sectionElement(subclasses: SrdSubclass[], cls: SrdClass = makeClass()) {
  return (
    <PrintTrayProvider>
      <SubclassesSection cls={cls} subclasses={subclasses} />
    </PrintTrayProvider>
  );
}

function renderSection(subclasses: SrdSubclass[], cls: SrdClass = makeClass()) {
  return render(sectionElement(subclasses, cls));
}

/** Two rows the owner may manage. */
function twoRows(): SrdSubclass[] {
  return [makeSubclass(), makeSubclass({ id: 'sc-sharp', name: 'Sharpshooter' })];
}

/** A promise the test settles by hand, to hold a request in flight. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

    it('holds a place for Add while a likely signed-in session hydrates', () => {
      hydrating(true);

      renderSection([]);

      expect(screen.getByRole('heading', { level: 2, name: 'Subclasses' })).toBeInTheDocument();
      expect(screen.getByTestId('skeleton')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Add subclass' })).not.toBeInTheDocument();
    });

    it('renders nothing while a session with no sign-in hint hydrates on a class with none', () => {
      hydrating(false);

      const { container } = renderSection([]);

      expect(container).toBeEmptyDOMElement();
    });

    // The hint is a stale cookie once hydration has settled on signed out, so it
    // must not hold a place for an Add button that is never coming.
    it('renders nothing once hydration settles signed out, even with the sign-in hint', () => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        likelyAuthenticated: true,
        isAdmin: false,
        user: null,
      });

      const { container } = renderSection([]);

      expect(container).toBeEmptyDOMElement();
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

    // Shared content is curated by admins. Having authored a row doesn't make a
    // non-admin its manager once it is shared.
    it('hides both from a non-admin on a shared subclass they created', () => {
      authAs('u1');

      renderSection([makeSubclass({ contentSource: 'shared', createdById: 'u1' })]);

      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
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
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/classes/cls-hb', {
        throwOnError: true,
      });
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/subclasses', {
        throwOnError: true,
      });
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

    // 400 is also where the validation pipe lands, so refetching on one would
    // reload the page under the author on every rejected name they correct.
    it('does not refresh after a 400 on a create', async () => {
      authAs('u2');
      mockApiFetch.mockRejectedValue(new ApiError(400, 'name must be shorter than 100 characters'));
      const user = userEvent.setup();

      renderSection([]);
      await startCreate(user, 'Deadeye');
      await user.click(screen.getByRole('button', { name: 'Create subclass' }));

      await waitFor(() =>
        expect(mockToast.error).toHaveBeenCalledWith('name must be shorter than 100 characters')
      );
      expect(mockInvalidateApiPath).not.toHaveBeenCalled();
      // The author's work is still in the form, ready to be corrected.
      expect(screen.getByLabelText(/^Name/)).toHaveValue('Deadeye');
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
        // Only the field the author changed.
        body: JSON.stringify({ description: 'Reworded.' }),
      });
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/classes/cls-hb', {
        throwOnError: true,
      });
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/subclasses', {
        throwOnError: true,
      });
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

    it('PATCHes the row whose form was saved, not the first row', async () => {
      authAs('u1');
      const user = userEvent.setup();

      renderSection(twoRows());
      await user.click(within(cardFor('Sharpshooter')).getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Steady.' } });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Updated Sharpshooter'));
      expect(mockApiFetch).toHaveBeenCalledWith('/srd/subclasses/sc-sharp', {
        method: 'PATCH',
        body: JSON.stringify({ description: 'Steady.' }),
      });
    });

    // The card below still holds the row as it loaded until the refetch lands, so
    // an Edit opened in that window would seed the form with the old values and a
    // second save would quietly revert the first.
    it('withdraws the saved row until the refresh that carries its new values settles', async () => {
      authAs('u1');
      const refetch = deferred();
      mockInvalidateApiPath.mockReturnValueOnce(refetch.promise);
      const user = userEvent.setup();

      renderSection(twoRows());
      await user.click(within(cardFor('Deadeye')).getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Reworded.' } });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Updated Deadeye'));
      const deadeye = cardFor('Deadeye');
      expect(within(deadeye).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(within(deadeye).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      // Only the saved row waits; the rest of the section is usable again.
      expect(within(cardFor('Sharpshooter')).getByRole('button', { name: 'Edit' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Add subclass' })).toBeVisible();

      refetch.resolve();

      expect(await within(cardFor('Deadeye')).findByRole('button', { name: 'Edit' })).toBeVisible();
    });

    // The refetch after a save can fail. React Query then keeps the old data
    // (invalidation still resolves), the pending mark lifts, and the card offers
    // Edit on the row as it was before the save. The mock never updates the props,
    // which is exactly that state. A second save from there must not resend the
    // stale description and revert the first.
    it('does not revert an earlier save when a later edit opens from a stale card', async () => {
      authAs('u1');
      const user = userEvent.setup();

      renderSection([makeSubclass()]);
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Reworded.' } });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Updated Deadeye'));

      await user.click(await screen.findByRole('button', { name: 'Edit' }));
      // Seeded from the stale card.
      expect(screen.getByLabelText('Description')).toHaveValue('A patient marksman.');
      fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Dead Eye' } });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Updated Dead Eye'));
      const [url, init] = mockApiFetch.mock.calls[1] as [string, { method: string; body: string }];
      expect(url).toBe('/srd/subclasses/sc-deadeye');
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toStrictEqual({ name: 'Dead Eye' });
    });

    it('toasts fallback copy for a non-Error edit rejection', async () => {
      authAs('u1');
      mockApiFetch.mockRejectedValue('boom');
      const user = userEvent.setup();

      renderSection([makeSubclass()]);
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Reworded.' } });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() =>
        expect(mockToast.error).toHaveBeenCalledWith('Failed to update subclass')
      );
      expect(mockInvalidateApiPath).not.toHaveBeenCalled();
    });

    // A PATCH with no fields still runs the write and refetches the page for a
    // change nobody made.
    it('closes an untouched edit without sending a PATCH', async () => {
      authAs('u1');
      const user = userEvent.setup();

      renderSection([makeSubclass()]);
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(mockApiFetch).not.toHaveBeenCalled();
      expect(mockToast.success).not.toHaveBeenCalled();
      expect(mockToast.error).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    });

    // The save landed, so the card on screen is a version behind. Handing Edit
    // back would seed the next form from it and revert what was just saved.
    it('keeps the saved row withdrawn and says so when the refresh fails', async () => {
      authAs('u1');
      mockInvalidateApiPath.mockRejectedValueOnce(new Error('offline'));
      const user = userEvent.setup();

      renderSection(twoRows());
      await user.click(within(cardFor('Deadeye')).getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Reworded.' } });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() =>
        expect(mockToast.error).toHaveBeenCalledWith(
          'Saved, but the page could not reload. Refresh to see the change.'
        )
      );
      expect(mockToast.success).toHaveBeenCalledWith('Updated Deadeye');
      const deadeye = cardFor('Deadeye');
      expect(within(deadeye).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(within(deadeye).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    // The two invalidations are independent. Skipping the picker list because the
    // class query's refetch failed would leave the character builder offering the
    // old rows for the rest of the session.
    it('still marks the picker lists stale when the class refetch fails', async () => {
      authAs('u1');
      mockInvalidateApiPath.mockImplementation((_client: unknown, prefix: string) =>
        prefix === '/srd/classes/cls-hb'
          ? Promise.reject(new Error('offline'))
          : Promise.resolve(undefined)
      );
      const user = userEvent.setup();

      renderSection([makeSubclass()]);
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Reworded.' } });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() =>
        expect(mockToast.error).toHaveBeenCalledWith(
          'Saved, but the page could not reload. Refresh to see the change.'
        )
      );
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/subclasses', {
        throwOnError: true,
      });
    });

    // The row was deleted from another tab, so this page is stale. Without a
    // refresh the card stays listed and every retry answers 404.
    it('refreshes after a 404 on an edit, so the row that is gone can drop out', async () => {
      authAs('u1');
      mockApiFetch.mockRejectedValue(new ApiError(404, 'Subclass not found'));
      const user = userEvent.setup();

      renderSection([makeSubclass()]);
      await user.click(screen.getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Reworded.' } });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Subclass not found'));
      await waitFor(() =>
        expect(mockInvalidateApiPath).toHaveBeenCalledWith(
          expect.anything(),
          '/srd/classes/cls-hb',
          { throwOnError: true }
        )
      );
    });
  });

  // An open form holds an unsaved draft in its own state, so every other control
  // that would unmount it is withdrawn while it is open. Save and Cancel are the
  // only ways out.
  describe('guarding an open form', () => {
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

    it('gives the controls back when the row being edited disappears', async () => {
      authAs('u1');
      const user = userEvent.setup();

      const { rerender } = renderSection(twoRows());
      await user.click(within(cardFor('Deadeye')).getByRole('button', { name: 'Edit' }));
      // Another tab deletes Deadeye, and the refetch drops it from the list.
      rerender(sectionElement([makeSubclass({ id: 'sc-sharp', name: 'Sharpshooter' })]));

      expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Add subclass' })).toBeInTheDocument();
      expect(within(cardFor('Sharpshooter')).getByRole('button', { name: 'Edit' })).toBeVisible();
    });
  });

  // Requests stay in flight while the author keeps working, so each write must
  // touch only the form or row it started from.
  describe('overlapping writes', () => {
    it('withdraws Edit and Delete on a row while its DELETE is pending, and restores them if it fails', async () => {
      authAs('u1');
      const del = deferred();
      mockApiFetch.mockReturnValueOnce(del.promise);
      const user = userEvent.setup();

      renderSection(twoRows());
      await user.click(within(cardFor('Sharpshooter')).getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete subclass' }));

      const sharp = cardFor('Sharpshooter');
      expect(within(sharp).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      expect(within(sharp).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(within(cardFor('Deadeye')).getByRole('button', { name: 'Delete' })).toBeVisible();

      del.reject(new Error('Network down'));

      await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Network down'));
      expect(within(cardFor('Sharpshooter')).getByRole('button', { name: 'Delete' })).toBeVisible();
    });

    it('keeps an edit opened during an in-flight delete saveable, and mounted when the delete lands', async () => {
      authAs('u1');
      const del = deferred();
      mockApiFetch.mockReturnValueOnce(del.promise);
      const user = userEvent.setup();

      renderSection(twoRows());
      await user.click(within(cardFor('Sharpshooter')).getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete subclass' }));
      await user.click(within(cardFor('Deadeye')).getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByLabelText('Description'), {
        target: { value: 'Half written.' },
      });

      // Nothing of this form's own is pending.
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();

      del.resolve();

      await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Deleted Sharpshooter'));
      expect(screen.getByLabelText('Description')).toHaveValue('Half written.');
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    });

    // Dismissing a form mid-save would hand the card back before the save lands,
    // and an edit reopened from it would freeze the values the save replaced.
    it('disables Cancel while the save is in flight', async () => {
      authAs('u1');
      const patch = deferred<unknown>();
      mockApiFetch.mockReturnValueOnce(patch.promise);
      const user = userEvent.setup();

      renderSection(twoRows());
      await user.click(within(cardFor('Deadeye')).getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Reworded.' } });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

      patch.resolve({});

      await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Updated Deadeye'));
      expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    });

    // The edited row can leave the list mid-save, deleted elsewhere and dropped by
    // a refetch, which takes its form with it. A form opened in that window would
    // inherit the in-flight save and mount frozen, with both buttons disabled.
    it('withdraws every control while a save is in flight, even after its row leaves', async () => {
      authAs('u1');
      const patch = deferred<unknown>();
      mockApiFetch.mockReturnValueOnce(patch.promise);
      const user = userEvent.setup();

      const { rerender } = renderSection(twoRows());
      await user.click(within(cardFor('Deadeye')).getByRole('button', { name: 'Edit' }));
      fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Reworded.' } });
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      rerender(sectionElement([makeSubclass({ id: 'sc-sharp', name: 'Sharpshooter' })]));

      expect(screen.queryByRole('button', { name: 'Add subclass' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

      patch.resolve({});

      expect(await screen.findByRole('button', { name: 'Add subclass' })).toBeVisible();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
    });

    it('keeps a second pending delete withdrawn when the first one settles', async () => {
      authAs('u1');
      const deleteSharp = deferred();
      const deleteDeadeye = deferred();
      mockApiFetch
        .mockReturnValueOnce(deleteSharp.promise)
        .mockReturnValueOnce(deleteDeadeye.promise);
      const user = userEvent.setup();

      renderSection(twoRows());
      await user.click(within(cardFor('Sharpshooter')).getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete subclass' }));
      await user.click(within(cardFor('Deadeye')).getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete subclass' }));

      deleteSharp.reject(new Error('Network down'));

      // Sharpshooter's controls coming back shows its delete has fully settled.
      await waitFor(() =>
        expect(
          within(cardFor('Sharpshooter')).getByRole('button', { name: 'Delete' })
        ).toBeVisible()
      );
      expect(
        within(cardFor('Deadeye')).queryByRole('button', { name: 'Delete' })
      ).not.toBeInTheDocument();
    });

    it('keeps a deleted row withdrawn until the refresh that drops it settles', async () => {
      authAs('u1');
      const refetch = deferred();
      mockInvalidateApiPath.mockReturnValueOnce(refetch.promise);
      const user = userEvent.setup();

      renderSection([makeSubclass()]);
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete subclass' }));

      await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Deleted Deadeye'));
      // The DELETE has landed and the refetch is still out. The row is still in
      // the list, and offering Delete again would send a second DELETE.
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

      refetch.resolve();

      // The mock never drops the row, so the controls return once the refresh settles.
      expect(await screen.findByRole('button', { name: 'Delete' })).toBeVisible();
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
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/classes/cls-hb', {
        throwOnError: true,
      });
      expect(mockInvalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/subclasses', {
        throwOnError: true,
      });
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

    // The row is gone on the server and the refetch that would drop it never
    // landed, so offering Delete again would only send a second DELETE.
    it('keeps the deleted row withdrawn and says so when the refresh fails', async () => {
      authAs('u1');
      mockInvalidateApiPath.mockRejectedValueOnce(new Error('offline'));
      const user = userEvent.setup();

      renderSection([makeSubclass()]);
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete subclass' }));

      await waitFor(() =>
        expect(mockToast.error).toHaveBeenCalledWith(
          'Deleted, but the page could not reload. Refresh to see the change.'
        )
      );
      expect(mockToast.success).toHaveBeenCalledWith('Deleted Deadeye');
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('refreshes after a 404 on a delete, so the row that is gone can drop out', async () => {
      authAs('u1');
      mockApiFetch.mockRejectedValue(new ApiError(404, 'Subclass not found'));
      const user = userEvent.setup();

      renderSection([makeSubclass()]);
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete subclass' }));

      await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Subclass not found'));
      await waitFor(() =>
        expect(mockInvalidateApiPath).toHaveBeenCalledWith(
          expect.anything(),
          '/srd/classes/cls-hb',
          { throwOnError: true }
        )
      );
    });

    // The row's buttons unmount in the same render that closes the dialog, so the
    // dialog's focus restore finds nothing and focus falls to the body.
    it('moves focus to the section heading when a row is deleted', async () => {
      authAs('u1');
      const user = userEvent.setup();

      renderSection(twoRows());
      await user.click(within(cardFor('Deadeye')).getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete subclass' }));

      await waitFor(() => expect(mockToast.success).toHaveBeenCalledWith('Deleted Deadeye'));
      expect(screen.getByRole('heading', { level: 2, name: 'Subclasses' })).toHaveFocus();
    });

    it('moves focus to the section heading when the delete fails', async () => {
      authAs('u1');
      mockApiFetch.mockRejectedValue(new Error('Network down'));
      const user = userEvent.setup();

      renderSection(twoRows());
      await user.click(within(cardFor('Deadeye')).getByRole('button', { name: 'Delete' }));
      await user.click(screen.getByRole('button', { name: 'Delete subclass' }));

      await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith('Network down'));
      expect(screen.getByRole('heading', { level: 2, name: 'Subclasses' })).toHaveFocus();
    });
  });
});
