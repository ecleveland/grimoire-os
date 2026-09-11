import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, type Query } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import EditClassPage from '../page';
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
const OWNER_AUTH = {
  isAuthenticated: true,
  isAdmin: false,
  isLoading: false,
  user: { userId: 'u1' },
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

  it('shows the failure state for the empty body a hidden or deleted class comes back as', async () => {
    // The server answers 200 with no body, and apiFetch's res.json() rejects on it.
    routeApi(() => Promise.reject(new SyntaxError('Unexpected end of JSON input')));

    renderPage();

    expect(await screen.findByText('Failed to load class.')).toBeInTheDocument();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to load class', { id: 'load-class' })
    );
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('keeps the loaded form and its unsaved edits when a background reload fails (VEG-508)', async () => {
    routeApi(() => Promise.resolve(makeClass()));
    const { client } = renderPage();
    await screen.findByDisplayValue('Warden');

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Grove Warden' } });
    routeApi(() => Promise.reject(new SyntaxError('Unexpected end of JSON input')));
    await act(() => client.refetchQueries({ queryKey: ['api', DETAIL] }));

    // The toast proves the reload really failed before the screen is judged.
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to load class', { id: 'load-class' })
    );
    expect(screen.queryByText('Failed to load class.')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Grove Warden');
  });

  it('shows the same failure state for a null body', async () => {
    routeApi(() => Promise.resolve(null));

    renderPage();

    expect(await screen.findByText('Failed to load class.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('denies editing an SRD class', async () => {
    routeApi(() => Promise.resolve(makeClass({ contentSource: 'srd', createdById: null })));

    renderPage();

    expect(
      await screen.findByText('You can only edit your own homebrew classes.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to classes' })).toHaveAttribute(
      'href',
      '/srd/classes'
    );
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it("denies editing another user's homebrew class", async () => {
    routeApi(() => Promise.resolve(makeClass({ createdById: 'someone-else' })));

    renderPage();

    expect(
      await screen.findByText('You can only edit your own homebrew classes.')
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('lets an admin edit a shared class', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdmin: true,
      isLoading: false,
      user: { userId: 'admin-1' },
    });
    routeApi(() =>
      Promise.resolve(makeClass({ contentSource: 'shared', createdById: 'other-admin' }))
    );

    renderPage();

    expect(await screen.findByDisplayValue('Warden')).toBeInTheDocument();
  });

  it('PATCHes the exact body with no feature ids or JSON columns, then returns to the list (VEG-508)', async () => {
    routeApi(() => Promise.resolve(makeClass()));
    const user = userEvent.setup();
    const { client } = renderPage();
    await screen.findByDisplayValue('Warden');
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Grove Warden' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/srd/classes'));
    // Exact: the fixture's feature ids and its multiclassing rules must not ride along.
    expect(patchBody()).toEqual({
      name: 'Grove Warden',
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
        { name: 'Wardens Bond', level: 1, description: 'A bond.' },
        { name: 'Grove Step', level: 4, description: 'Step between trees.' },
      ],
    });
    expect(toast.success).toHaveBeenCalledWith('Class updated');
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidates(invalidate, DETAIL)).toBe(true);
    expect(invalidates(invalidate, '/srd/classes?page=1&limit=100')).toBe(true);
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

  it('renders the form after Retry once the next load succeeds', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new SyntaxError('Unexpected end of JSON input'))
      .mockResolvedValue(makeClass());
    routeApi(get);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Failed to load class.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByDisplayValue('Warden')).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });
});
