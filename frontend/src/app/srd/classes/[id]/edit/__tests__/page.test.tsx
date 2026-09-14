import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, type Query } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import EditClassPage from '../page';
import { ApiError } from '@/lib/api';
import type { SrdClass } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockUseAuth = vi.fn();
const mockPush = vi.fn();
const mockBack = vi.fn();

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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useParams: () => ({ id: 'cls-hb' }),
}));

const DETAIL = '/srd/classes/cls-hb';
const DENIAL = 'You can only edit your own homebrew classes.';
const OWNER_AUTH = {
  isAuthenticated: true,
  isAdmin: false,
  isLoading: false,
  user: { userId: 'u1' },
};
const ADMIN_AUTH = {
  isAuthenticated: true,
  isAdmin: true,
  isLoading: false,
  user: { userId: 'admin-1' },
};

function makeClass(over: Partial<SrdClass> = {}): SrdClass {
  return {
    id: 'cls-hb',
    name: 'Warden',
    hitDie: 'd10',
    description: 'A sworn protector of wild places.',
    primaryAbilities: ['Strength', 'Wisdom'],
    savingThrows: ['Strength', 'Constitution'],
    skillChoices: ['Athletics', 'Nature', 'Survival'],
    numSkillChoices: 2,
    armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
    weaponProficiencies: ['Simple weapons', 'Martial weapons'],
    toolProficiencies: ['Herbalism Kit'],
    subclassLevel: 3,
    features: [
      { id: 'cf-1', name: 'Wardens Bond', level: 1, description: 'A bond.' },
      { id: 'cf-2', name: 'Grove Step', level: 4, description: 'Step between trees.' },
    ],
    multiclassing: {
      prerequisites: [{ ability: 'Wisdom', minimum: 13 }],
      proficienciesGained: ['Shields'],
      casterType: null,
    },
    source: 'Homebrew',
    contentSource: 'homebrew',
    createdById: 'u1',
    ...over,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...render(<EditClassPage />, { wrapper }) };
}

/** Answers the detail GET and the PATCH; anything else fails loudly. */
function routeApi(
  get: () => Promise<unknown>,
  patch: () => Promise<unknown> = () => Promise.resolve(makeClass())
) {
  mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (path === DETAIL && init === undefined) return get();
    if (path === DETAIL && init?.method === 'PATCH') return patch();
    return Promise.reject(new Error(`unexpected ${init?.method ?? 'GET'} ${path}`));
  });
}

function patchBody(): unknown {
  const call = mockApiFetch.mock.calls.find(
    ([path, init]) => path === DETAIL && init?.method === 'PATCH'
  );
  if (!call) throw new Error('no PATCH was sent');
  return JSON.parse(call[1].body);
}

/** Whether the first invalidation the page issued covers a cached API path. */
function invalidates(spy: MockInstance<QueryClient['invalidateQueries']>, path: string): boolean {
  const predicate = spy.mock.calls[0]?.[0]?.predicate;
  if (!predicate) throw new Error('expected an invalidation filtered by predicate');
  return predicate({ queryKey: ['api', path] } as unknown as Query);
}

/** The loaded fixture's scalar fields, as a PATCH that leaves them alone sends them. */
const UNCHANGED_FIELDS = {
  name: 'Warden',
  hitDie: 'd10',
  description: 'A sworn protector of wild places.',
  primaryAbilities: ['Strength', 'Wisdom'],
  savingThrows: ['Strength', 'Constitution'],
  skillChoices: ['Athletics', 'Nature', 'Survival'],
  numSkillChoices: 2,
  armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
  weaponProficiencies: ['Simple weapons', 'Martial weapons'],
  toolProficiencies: ['Herbalism Kit'],
  subclassLevel: 3,
};

describe('EditClassPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(OWNER_AUTH);
  });

  it('shows Loading... while auth hydrates, even once the class has loaded, and never the denial', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isAdmin: false,
      isLoading: true,
      user: null,
    });
    routeApi(() => Promise.resolve(makeClass()));
    const { client, rerender } = renderPage();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(DETAIL));
    await waitFor(() => expect(client.getQueryState(['api', DETAIL])?.status).toBe('success'));
    // Let the query observer hand the loaded class to the page before judging the screen.
    await act(() => new Promise(resolve => setTimeout(resolve, 0)));
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText(/only edit your own/)).not.toBeInTheDocument();

    mockUseAuth.mockReturnValue(OWNER_AUTH);
    rerender(<EditClassPage />);
    expect(await screen.findByDisplayValue('Warden')).toBeInTheDocument();
  });

  it('loads the class and prefills the form for its owner (VEG-508)', async () => {
    routeApi(() => Promise.resolve(makeClass()));

    renderPage();

    expect(await screen.findByDisplayValue('Warden')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit Class' })).toBeInTheDocument();
    expect(screen.getByLabelText('Hit die')).toHaveValue('d10');
    expect(
      screen.getAllByLabelText('Feature name').map(el => (el as HTMLInputElement).value)
    ).toEqual(['Wardens Bond', 'Grove Step']);
    expect(screen.getByText(/^This class also has multiclassing rules\./)).toBeInTheDocument();
  });

  it('shows Class not found. with a way back and no Retry for a hidden or deleted class (null) (VEG-508)', async () => {
    // apiFetch reads the empty 200 the API sends for a class the caller can't see as null.
    routeApi(() => Promise.resolve(null));

    renderPage();

    expect(await screen.findByText('Class not found.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to classes' })).toHaveAttribute(
      'href',
      '/srd/classes'
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByText('Failed to load class.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows Failed to load class. with Retry and the toast during an outage (VEG-508)', async () => {
    routeApi(() => Promise.reject(new ApiError(503, 'Service Unavailable')));

    renderPage();

    expect(await screen.findByText('Failed to load class.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to load class', { id: 'load-class' })
    );
    expect(screen.queryByText('Class not found.')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('keeps the loaded form and its unsaved edits when a background reload fails (VEG-508)', async () => {
    routeApi(() => Promise.resolve(makeClass()));
    const { client } = renderPage();
    await screen.findByDisplayValue('Warden');

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Grove Warden' } });
    routeApi(() => Promise.reject(new ApiError(503, 'Service Unavailable')));
    await act(() => client.refetchQueries({ queryKey: ['api', DETAIL] }));

    // The toast proves the reload really failed before the screen is judged.
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to load class', { id: 'load-class' })
    );
    expect(screen.queryByText('Failed to load class.')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Grove Warden');
  });

  it('renders the form after Retry once the next load succeeds', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, 'Service Unavailable'))
      .mockResolvedValue(makeClass());
    routeApi(get);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Failed to load class.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByDisplayValue('Warden')).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('denies editing an SRD class', async () => {
    routeApi(() => Promise.resolve(makeClass({ contentSource: 'srd', createdById: null })));

    renderPage();

    expect(await screen.findByText(DENIAL)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to classes' })).toHaveAttribute(
      'href',
      '/srd/classes'
    );
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it("denies editing another user's homebrew class", async () => {
    routeApi(() => Promise.resolve(makeClass({ createdById: 'someone-else' })));

    renderPage();

    expect(await screen.findByText(DENIAL)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('denies a non-admin editing a shared class, even one they created (VEG-508)', async () => {
    routeApi(() => Promise.resolve(makeClass({ contentSource: 'shared', createdById: 'u1' })));

    renderPage();

    expect(await screen.findByText(DENIAL)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('denies an admin editing an SRD class (VEG-508)', async () => {
    mockUseAuth.mockReturnValue(ADMIN_AUTH);
    routeApi(() => Promise.resolve(makeClass({ contentSource: 'srd', createdById: null })));

    renderPage();

    expect(await screen.findByText(DENIAL)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('lets an admin edit a shared class', async () => {
    mockUseAuth.mockReturnValue(ADMIN_AUTH);
    routeApi(() =>
      Promise.resolve(makeClass({ contentSource: 'shared', createdById: 'other-admin' }))
    );

    renderPage();

    expect(await screen.findByDisplayValue('Warden')).toBeInTheDocument();
  });

  it('PATCHes a rename without features or the JSON columns, and navigates before invalidating (VEG-508)', async () => {
    routeApi(() => Promise.resolve(makeClass()));
    const user = userEvent.setup();
    const { client } = renderPage();
    await screen.findByDisplayValue('Warden');
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Grove Warden' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    // Exact: the unchanged features and the fixture's multiclassing rules stay out.
    expect(patchBody()).toStrictEqual({ ...UNCHANGED_FIELDS, name: 'Grove Warden' });
    expect(toast.success).toHaveBeenCalledWith('Class updated');
    expect(mockPush).toHaveBeenCalledWith('/srd/classes');
    expect(mockPush.mock.invocationCallOrder[0]).toBeLessThan(
      invalidate.mock.invocationCallOrder[0]
    );
    // The bare key is the one the list page and the builder steps cache.
    expect(invalidates(invalidate, '/srd/classes')).toBe(true);
    expect(invalidates(invalidate, DETAIL)).toBe(true);
  });

  it('sends features, without their ids, when a feature is renamed (VEG-508)', async () => {
    routeApi(() => Promise.resolve(makeClass()));
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('Warden');

    fireEvent.change(screen.getAllByLabelText('Feature name')[1], {
      target: { value: 'Grove Stride' },
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/srd/classes'));
    expect(patchBody()).toStrictEqual({
      ...UNCHANGED_FIELDS,
      features: [
        { name: 'Wardens Bond', level: 1, description: 'A bond.' },
        { name: 'Grove Stride', level: 4, description: 'Step between trees.' },
      ],
    });
  });

  it('toasts the API error message and stays on the page when the save fails', async () => {
    routeApi(
      () => Promise.resolve(makeClass()),
      () => Promise.reject(new Error('You already have a class with this name'))
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('Warden');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('You already have a class with this name')
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for a non-Error save rejection', async () => {
    routeApi(
      () => Promise.resolve(makeClass()),
      () => Promise.reject('boom')
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('Warden');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to update class'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows a disabled Saving... button while the save is still in flight', async () => {
    routeApi(
      () => Promise.resolve(makeClass()),
      () => new Promise(() => {})
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('Warden');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('goes back when Cancel is pressed', async () => {
    routeApi(() => Promise.resolve(makeClass()));
    const user = userEvent.setup();
    renderPage();
    await screen.findByDisplayValue('Warden');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(() => patchBody()).toThrow('no PATCH was sent');
  });
});
