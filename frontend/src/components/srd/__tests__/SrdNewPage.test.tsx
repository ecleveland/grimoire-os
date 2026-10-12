import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, type Query } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import SrdNewPage from '../SrdNewPage';
import { SRD_KINDS, SRD_REGISTRY, type SrdKind } from '@/lib/srd-registry';

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
  useParams: () => ({ id: 'hb-1' }),
}));

/** BackgroundForm reads every page of the feat catalog for its origin feat picker. */
const ORIGIN_FEATS = '/srd/feats?limit=100&page=1';

interface NewCase {
  /** Fills the fields the form needs before it will submit. */
  fillRequired(user: UserEvent): Promise<void>;
  /** The keys the POST body must carry after fillRequired. */
  expectedBody: Record<string, unknown>;
}

function fill(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const KINDS: Record<SrdKind, NewCase> = {
  spell: {
    async fillRequired() {
      fill(/^Name/, 'Spark');
      fill(/^School/, 'Evocation');
      fill(/Casting Time/, '1 action');
      fill(/^Range/, 'Touch');
      fill(/^Components/, 'V');
      fill(/^Duration/, 'Instantaneous');
      fill(/^Description/, 'A small spark.');
    },
    expectedBody: {
      name: 'Spark',
      level: 0,
      school: 'Evocation',
      castingTime: '1 action',
      range: 'Touch',
      components: 'V',
      duration: 'Instantaneous',
      description: 'A small spark.',
      material: null,
      higherLevels: null,
    },
  },
  monster: {
    async fillRequired() {
      fill(/^Name/, 'Rat King');
      fill(/^Size/, 'Medium');
      fill(/^Type/, 'Beast');
      fill(/Armor Class/, '12');
      fill(/Hit Points/, '20');
      fill(/^Speed/, '20 ft.');
      fill(/Challenge Rating/, '1/2');
    },
    expectedBody: {
      name: 'Rat King',
      size: 'Medium',
      type: 'Beast',
      armorClass: 12,
      hitPoints: 20,
      challengeRating: 0.5,
    },
  },
  item: {
    async fillRequired() {
      fill(/^Name/, 'Lucky Coin');
      fill(/^Category/, 'Wondrous Item');
    },
    expectedBody: {
      name: 'Lucky Coin',
      category: 'Wondrous Item',
      rarity: null,
      cost: null,
      weight: null,
      properties: null,
      description: null,
      requiresAttunement: false,
      isMagic: false,
      stealthDisadvantage: false,
    },
  },
  feat: {
    async fillRequired() {
      fill(/^Name/, 'Lucky Dodge');
      fill(/^Description/, 'You twist away from danger.');
    },
    expectedBody: {
      name: 'Lucky Dodge',
      description: 'You twist away from danger.',
      prerequisite: null,
      benefits: null,
      category: null,
      repeatable: false,
    },
  },
  background: {
    async fillRequired(user) {
      fill(/^Name/, 'Gravedigger');
      await user.click(screen.getByRole('button', { name: 'Insight' }));
      await user.click(screen.getByRole('button', { name: 'Religion' }));
    },
    expectedBody: {
      name: 'Gravedigger',
      skillProficiencies: ['Insight', 'Religion'],
      languages: 0,
      originFeatId: null,
      originFeatOption: null,
    },
  },
  class: {
    async fillRequired(user) {
      fill(/^Name/, 'Warden');
      await user.selectOptions(screen.getByLabelText('Hit die'), 'd10');
      await user.click(
        within(screen.getByRole('group', { name: 'Primary abilities' })).getByRole('button', {
          name: 'Strength',
        })
      );
      const skills = within(screen.getByRole('group', { name: 'Skill choices' }));
      await user.click(skills.getByRole('button', { name: 'Athletics' }));
      await user.click(skills.getByRole('button', { name: 'Survival' }));
      fill('Number of skill choices', '2');
      await user.click(screen.getByRole('button', { name: /add feature/i }));
      fill('Feature name', 'Wardens Bond');
    },
    expectedBody: {
      name: 'Warden',
      hitDie: 'd10',
      description: null,
      primaryAbilities: ['Strength'],
      savingThrows: [],
      skillChoices: ['Athletics', 'Survival'],
      numSkillChoices: 2,
      armorProficiencies: [],
      weaponProficiencies: [],
      toolProficiencies: [],
      subclassLevel: null,
      features: [{ name: 'Wardens Bond', level: 1, description: '' }],
    },
  },
};

function renderPage(kind: SrdKind) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...render(<SrdNewPage kind={kind} />, { wrapper }) };
}

/** Answers the POST and the origin feat list; anything else fails loudly. */
function routeApi(kind: SrdKind, post: () => Promise<unknown>) {
  const { apiPath } = SRD_REGISTRY[kind];
  mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (path === apiPath && init?.method === 'POST') return post();
    if (path === ORIGIN_FEATS && init === undefined)
      return Promise.resolve({ data: [], total: 0, page: 1, lastPage: 1 });
    return Promise.reject(new Error(`unexpected ${init?.method ?? 'GET'} ${path}`));
  });
}

function postCalls() {
  return mockApiFetch.mock.calls.filter(([, init]) => init?.method === 'POST');
}

/** Whether the first invalidation the page issued covers a cached API path. */
function invalidates(spy: MockInstance<QueryClient['invalidateQueries']>, path: string): boolean {
  const predicate = spy.mock.calls[0]?.[0]?.predicate;
  if (!predicate) throw new Error('expected an invalidation filtered by predicate');
  return predicate({ queryKey: ['api', path] } as unknown as Query);
}

describe.each(SRD_KINDS)('SrdNewPage for a %s', kind => {
  const entry = SRD_REGISTRY[kind];
  const { fillRequired, expectedBody } = KINDS[kind];
  const submitLabel = `Create ${entry.label.toLowerCase()}`;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { userId: 'u1' },
    });
    routeApi(kind, () => Promise.resolve({ id: 'hb-new' }));
  });

  it('renders nothing while auth is still hydrating', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true, user: null });

    const { container } = renderPage(kind);

    expect(container).toBeEmptyDOMElement();
  });

  it('prompts an anonymous visitor to sign in instead of rendering the form', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false, user: null });

    renderPage(kind);

    expect(screen.getByText(`Sign in to create homebrew ${entry.plural}.`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('POSTs the form body and returns to the list only once the list cache is invalidated', async () => {
    let finishInvalidate: () => void = () => {};
    const user = userEvent.setup();
    const { client } = renderPage(kind);
    const invalidate = vi
      .spyOn(client, 'invalidateQueries')
      .mockImplementationOnce(() => new Promise<void>(resolve => (finishInvalidate = resolve)));

    expect(screen.getByRole('heading', { name: `Create ${entry.label}` })).toBeInTheDocument();
    expect(screen.getByText(entry.createBlurb)).toBeInTheDocument();
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: submitLabel }));

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    const [[path, init]] = postCalls();
    expect(path).toBe(entry.apiPath);
    expect(JSON.parse(init.body)).toEqual(expect.objectContaining(expectedBody));
    expect(toast.success).toHaveBeenCalledWith(`${entry.label} created`);
    // The bare path covers the list's paged keys as well as the bare key other
    // pages cache the catalog under.
    expect(invalidates(invalidate, entry.apiPath)).toBe(true);
    expect(invalidates(invalidate, `${entry.apiPath}?page=1`)).toBe(true);
    // The list keeps a staleTime, so landing on it before the invalidation
    // settles would show the cached list without the new row.
    expect(mockPush).not.toHaveBeenCalled();

    finishInvalidate();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(entry.listPath));
  });

  it('toasts the API error message and stays on the page', async () => {
    routeApi(kind, () => Promise.reject(new Error(`You already have a ${kind} with this name`)));
    const user = userEvent.setup();
    renderPage(kind);

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: submitLabel }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(`You already have a ${kind} with this name`)
    );
    expect(screen.getByRole('button', { name: submitLabel })).toBeEnabled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for a non-Error rejection', async () => {
    routeApi(kind, () => Promise.reject('boom'));
    const user = userEvent.setup();
    renderPage(kind);

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: submitLabel }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(`Failed to create ${kind}`));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows a disabled Saving... button while the create is still in flight', async () => {
    routeApi(kind, () => new Promise(() => {}));
    const user = userEvent.setup();
    renderPage(kind);

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: submitLabel }));

    expect(await screen.findByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('goes back when Cancel is pressed', async () => {
    const user = userEvent.setup();
    renderPage(kind);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(postCalls()).toHaveLength(0);
  });
});

describe('SrdNewPage form rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { userId: 'u1' },
    });
  });

  it('toasts a class validation failure and never calls the API', async () => {
    routeApi('class', () => Promise.resolve({ id: 'hb-new' }));
    const user = userEvent.setup();
    renderPage('class');

    fill(/^Name/, 'Warden');
    const skills = within(screen.getByRole('group', { name: 'Skill choices' }));
    await user.click(skills.getByRole('button', { name: 'Athletics' }));
    await user.click(skills.getByRole('button', { name: 'Survival' }));
    fill('Number of skill choices', '3');
    await user.click(screen.getByRole('button', { name: 'Create class' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Number of skill choices can't be more than the skills offered (2)"
      )
    );
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('rejects a typed-but-unpicked origin feat with a toast, without calling the API', async () => {
    routeApi('background', () => Promise.resolve({ id: 'hb-new' }));
    const user = userEvent.setup();
    renderPage('background');

    fill(/^Name/, 'Gravedigger');
    fill(/^Origin feat$/, 'Alert');
    await user.click(screen.getByRole('button', { name: 'Create background' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Pick the origin feat from the list (SRD or one of your homebrew feats)'
      )
    );
    expect(postCalls()).toHaveLength(0);
  });
});
