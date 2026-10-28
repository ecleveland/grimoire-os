import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import SrdEditPage from '../SrdEditPage';
import { ApiError } from '@/lib/api';
import { SRD_KINDS, SRD_REGISTRY, type SrdEditable, type SrdKind } from '@/lib/srd-registry';
import type { SrdBackground, SrdClass, SrdFeat, SrdItem, SrdMonster, SrdSpell } from '@/lib/types';

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
const OWNED = { source: 'Homebrew', contentSource: 'homebrew', createdById: 'u1' } as const;

function makeSpell(over: Partial<SrdSpell> = {}): SrdSpell {
  return {
    id: 'hb-1',
    name: 'Soul Bonfire',
    level: 3,
    school: 'Evocation',
    castingTime: '1 action',
    range: '150 feet',
    components: 'V, S, M',
    duration: 'Instantaneous',
    description: 'A bright streak flashes.',
    classes: ['Sorcerer'],
    ritual: false,
    concentration: true,
    material: 'A tiny ball of bat guano',
    ...OWNED,
    ...over,
  };
}

function makeMonster(over: Partial<SrdMonster> = {}): SrdMonster {
  return {
    id: 'hb-1',
    name: 'Cave Troll',
    size: 'Large',
    type: 'Giant',
    alignment: 'chaotic evil',
    armorClass: 15,
    hitPoints: 84,
    speed: '30 ft.',
    str: 18,
    dex: 13,
    con: 20,
    int: 7,
    wis: 9,
    cha: 7,
    damageResistances: [],
    damageImmunities: [],
    damageVulnerabilities: [],
    conditionImmunities: [],
    challengeRating: 5,
    actions: [{ name: 'Slam', description: '+7 to hit.' }],
    ...OWNED,
    ...over,
  };
}

function makeItem(over: Partial<SrdItem> = {}): SrdItem {
  return {
    id: 'hb-1',
    name: 'Lucky Coin',
    category: 'Wondrous Item',
    rarity: 'Uncommon',
    properties: ['Shiny'],
    description: 'A coin that always lands on edge.',
    requiresAttunement: false,
    isMagic: true,
    ...OWNED,
    ...over,
  };
}

function makeFeat(over: Partial<SrdFeat> = {}): SrdFeat {
  return {
    id: 'hb-1',
    name: 'Lucky Dodge',
    description: 'You twist away from danger.',
    prerequisite: 'Dex 13+',
    benefits: ['Once per rest, impose disadvantage on an attack against you.'],
    category: 'General',
    repeatable: false,
    ...OWNED,
    ...over,
  };
}

function makeBackground(over: Partial<SrdBackground> = {}): SrdBackground {
  return {
    id: 'hb-1',
    name: 'Gravedigger',
    description: 'Tending the resting places of the dead.',
    skillProficiencies: ['Insight'],
    toolProficiencies: [],
    languages: 0,
    personalityTraits: [],
    ideals: [],
    bonds: [],
    flaws: [],
    originFeat: { id: 'feat-alert', name: 'Alert' },
    originFeatOption: null,
    ...OWNED,
    ...over,
  };
}

function makeClass(over: Partial<SrdClass> = {}): SrdClass {
  return {
    id: 'hb-1',
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
    ...OWNED,
    ...over,
  };
}

interface EditCase {
  make(over?: Partial<SrdEditable>): SrdEditable & { name: string };
  /** The field the rename cases edit. */
  renameField: RegExp;
  renamed: string;
  /** The keys the PATCH must carry after the rename. */
  expectedPatch: Record<string, unknown>;
}

const KINDS: Record<SrdKind, EditCase> = {
  spell: {
    make: makeSpell,
    renameField: /^Name/,
    renamed: 'Ember Storm',
    expectedPatch: { name: 'Ember Storm' },
  },
  monster: {
    make: makeMonster,
    renameField: /^Name/,
    renamed: 'Bridge Troll',
    expectedPatch: { name: 'Bridge Troll' },
  },
  item: {
    make: makeItem,
    renameField: /^Name/,
    renamed: 'Luckier Coin',
    expectedPatch: { name: 'Luckier Coin' },
  },
  feat: {
    make: makeFeat,
    renameField: /^Name/,
    renamed: 'Uncanny Dodge',
    expectedPatch: { name: 'Uncanny Dodge' },
  },
  background: {
    make: makeBackground,
    renameField: /^Name/,
    renamed: 'Exhumer',
    expectedPatch: { name: 'Exhumer', originFeatId: 'feat-alert' },
  },
  class: {
    make: makeClass,
    renameField: /^Name/,
    renamed: 'Grove Warden',
    expectedPatch: { name: 'Grove Warden' },
  },
};

function renderPage(kind: SrdKind) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...render(<SrdEditPage kind={kind} />, { wrapper }) };
}

function detailPath(kind: SrdKind) {
  return `${SRD_REGISTRY[kind].apiPath}/hb-1`;
}

/** Answers the detail GET, the PATCH and the origin feat list; anything else fails loudly. */
function routeApi(
  kind: SrdKind,
  get: () => Promise<unknown>,
  patch: () => Promise<unknown> = () => Promise.resolve(KINDS[kind].make())
) {
  const detail = detailPath(kind);
  mockApiFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (path === detail && init === undefined) return get();
    if (path === detail && init?.method === 'PATCH') return patch();
    if (path === ORIGIN_FEATS && init === undefined)
      return Promise.resolve({
        data: [{ id: 'feat-alert', name: 'Alert' }],
        total: 1,
        page: 1,
        lastPage: 1,
      });
    return Promise.reject(new Error(`unexpected ${init?.method ?? 'GET'} ${path}`));
  });
}

function patchCalls() {
  return mockApiFetch.mock.calls.filter(([, init]) => init?.method === 'PATCH');
}

function patchBody(): unknown {
  const [call] = patchCalls();
  if (!call) throw new Error('no PATCH was sent');
  return JSON.parse(call[1].body);
}

describe.each(SRD_KINDS)('SrdEditPage for a %s', kind => {
  const entry = SRD_REGISTRY[kind];
  const { make, renameField, renamed } = KINDS[kind];
  const name = make().name;
  const detail = detailPath(kind);
  const denial = `You can only edit your own homebrew ${entry.plural}.`;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(OWNER_AUTH);
    routeApi(kind, () => Promise.resolve(make()));
  });

  it('shows Loading… while auth hydrates, even once the row has loaded, and never the denial', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isAdmin: false,
      isLoading: true,
      user: null,
    });
    const { client, rerender } = renderPage(kind);

    await waitFor(() => expect(client.getQueryState(['api', detail])?.status).toBe('success'));
    // Let the query observer hand the loaded row to the page before judging the screen.
    await act(() => new Promise(resolve => setTimeout(resolve, 0)));
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByText(denial)).not.toBeInTheDocument();

    mockUseAuth.mockReturnValue(OWNER_AUTH);
    rerender(<SrdEditPage kind={kind} />);
    expect(await screen.findByRole('textbox', { name: renameField })).toHaveValue(name);
  });

  it('loads the row from its detail path and prefills the form for its owner', async () => {
    renderPage(kind);

    expect(await screen.findByRole('textbox', { name: renameField })).toHaveValue(name);
    expect(screen.getByRole('heading', { name: `Edit ${entry.label}` })).toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenCalledWith(detail);
  });

  it('shows not found with a way back and no Retry for a hidden or deleted row (null)', async () => {
    // apiFetch reads the empty 200 the API sends for a row the caller can't see as null.
    routeApi(kind, () => Promise.resolve(null));
    renderPage(kind);

    expect(await screen.findByText(`${entry.label} not found.`)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Back to ${entry.plural}` })).toHaveAttribute(
      'href',
      entry.listPath
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: renameField })).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows the loading state, not the not-found view, while a refetch after null is in flight', async () => {
    // A null stays cached for the staleTime, so a revisit after a hidden-row
    // visit refetches it. The page must not flash "not found" meanwhile.
    const get = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockReturnValue(new Promise(() => {}));
    routeApi(kind, get);
    const { client } = renderPage(kind);
    await screen.findByText(`${entry.label} not found.`);

    // Fire and forget: the refetch never settles in this test.
    act(() => {
      void client.refetchQueries({ queryKey: ['api', detail] });
    });

    expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByText(`${entry.label} not found.`)).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('shows the load failure with Retry and the toast during an outage', async () => {
    routeApi(kind, () => Promise.reject(new ApiError(503, 'Service Unavailable')));
    renderPage(kind);

    expect(await screen.findByText(`Failed to load ${kind}.`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(`Failed to load ${kind}`, { id: `load-${kind}` })
    );
    expect(screen.queryByRole('textbox', { name: renameField })).not.toBeInTheDocument();
  });

  it('renders the form after Retry once the next load succeeds', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, 'Service Unavailable'))
      .mockResolvedValue(make());
    routeApi(kind, get);
    const user = userEvent.setup();
    renderPage(kind);

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('textbox', { name: renameField })).toHaveValue(name);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('shows the loading state, not the error, while a retry is in flight', async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, 'Service Unavailable'))
      .mockReturnValue(new Promise(() => {}));
    routeApi(kind, get);
    const user = userEvent.setup();
    renderPage(kind);

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the loaded form and its unsaved edits when a background reload fails', async () => {
    const { client } = renderPage(kind);
    fireEvent.change(await screen.findByRole('textbox', { name: renameField }), {
      target: { value: renamed },
    });

    routeApi(kind, () => Promise.reject(new ApiError(503, 'Service Unavailable')));
    await act(() => client.refetchQueries({ queryKey: ['api', detail] }));

    // The toast proves the reload really failed before the screen is judged.
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(`Failed to load ${kind}`, { id: `load-${kind}` })
    );
    expect(screen.queryByText(`Failed to load ${kind}.`)).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: renameField })).toHaveValue(renamed);
  });

  it.each([
    ['an SRD row', OWNER_AUTH, { contentSource: 'srd', createdById: null }],
    ["another user's homebrew", OWNER_AUTH, { createdById: 'someone-else' }],
    [
      'a shared row for a non-admin, even its creator',
      OWNER_AUTH,
      { contentSource: 'shared', createdById: 'u1' },
    ],
    ['an SRD row for an admin', ADMIN_AUTH, { contentSource: 'srd', createdById: null }],
  ] as const)('denies editing %s', async (_case, auth, over) => {
    mockUseAuth.mockReturnValue(auth);
    routeApi(kind, () => Promise.resolve(make(over)));
    renderPage(kind);

    expect(await screen.findByText(denial)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Back to ${entry.plural}` })).toHaveAttribute(
      'href',
      entry.listPath
    );
    expect(screen.queryByRole('textbox', { name: renameField })).not.toBeInTheDocument();
  });

  it('lets an admin edit a shared row', async () => {
    mockUseAuth.mockReturnValue(ADMIN_AUTH);
    routeApi(kind, () =>
      Promise.resolve(make({ contentSource: 'shared', createdById: 'other-admin' }))
    );
    renderPage(kind);

    expect(await screen.findByRole('textbox', { name: renameField })).toHaveValue(name);
  });
});

describe.each(SRD_KINDS)('SrdEditPage saving a %s', kind => {
  const entry = SRD_REGISTRY[kind];
  const { make, renameField, renamed, expectedPatch } = KINDS[kind];
  const listKey = ['api', `${entry.apiPath}?page=1`];

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(OWNER_AUTH);
    routeApi(kind, () => Promise.resolve(make()));
  });

  it('PATCHes the edited body to the detail path and returns to the list', async () => {
    const user = userEvent.setup();
    renderPage(kind);

    fireEvent.change(await screen.findByRole('textbox', { name: renameField }), {
      target: { value: renamed },
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(entry.listPath));
    expect(patchCalls()[0][0]).toBe(detailPath(kind));
    expect(patchBody()).toEqual(expect.objectContaining(expectedPatch));
    expect(toast.success).toHaveBeenCalledWith(`${entry.label} updated`);
  });

  it('invalidates the cached list after navigating away', async () => {
    const user = userEvent.setup();
    const { client } = renderPage(kind);
    client.setQueryData(listKey, { data: [], total: 0, page: 1, lastPage: 1 });
    await screen.findByRole('textbox', { name: renameField });
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(client.getQueryState(listKey)?.isInvalidated).toBe(true));
    // The prefix also matches this page's own detail key, so the page leaves
    // before the refetch rather than waiting on it.
    expect(mockPush.mock.invocationCallOrder[0]).toBeLessThan(
      invalidate.mock.invocationCallOrder[0]
    );
  });

  it('toasts the API error message and stays on the page when the save fails', async () => {
    routeApi(
      kind,
      () => Promise.resolve(make()),
      () => Promise.reject(new Error(`You already have a ${kind} with this name`))
    );
    const user = userEvent.setup();
    renderPage(kind);
    await screen.findByRole('textbox', { name: renameField });

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(`You already have a ${kind} with this name`)
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for a non-Error save rejection', async () => {
    routeApi(
      kind,
      () => Promise.resolve(make()),
      () => Promise.reject('boom')
    );
    const user = userEvent.setup();
    renderPage(kind);
    await screen.findByRole('textbox', { name: renameField });

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(`Failed to update ${kind}`));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('keeps Save disabled after a successful save so a second click cannot re-PATCH', async () => {
    const user = userEvent.setup();
    renderPage(kind);
    await screen.findByRole('textbox', { name: renameField });

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(entry.listPath));

    const save = screen.getByRole('button', { name: 'Saving...' });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(patchCalls()).toHaveLength(1);
  });

  it('goes back when Cancel is pressed', async () => {
    const user = userEvent.setup();
    renderPage(kind);
    await screen.findByRole('textbox', { name: renameField });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(patchCalls()).toHaveLength(0);
  });
});

describe('SrdEditPage form rules', () => {
  /** The class fixture's scalar fields, as a PATCH that leaves them alone sends them. */
  const UNCHANGED_CLASS_FIELDS = {
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(OWNER_AUTH);
  });

  it('PATCHes a class rename without features or the JSON columns', async () => {
    routeApi('class', () => Promise.resolve(makeClass()));
    const user = userEvent.setup();
    renderPage('class');

    fireEvent.change(await screen.findByRole('textbox', { name: /^Name/ }), {
      target: { value: 'Grove Warden' },
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/srd/classes'));
    // Exact: the unchanged features and the fixture's multiclassing rules stay out.
    expect(patchBody()).toStrictEqual({ ...UNCHANGED_CLASS_FIELDS, name: 'Grove Warden' });
  });

  it('sends class features without their ids when a feature is renamed', async () => {
    routeApi('class', () => Promise.resolve(makeClass()));
    const user = userEvent.setup();
    renderPage('class');
    await screen.findByRole('textbox', { name: /^Name/ });

    fireEvent.change(screen.getAllByLabelText('Feature name')[1], {
      target: { value: 'Grove Stride' },
    });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/srd/classes'));
    expect(patchBody()).toStrictEqual({
      ...UNCHANGED_CLASS_FIELDS,
      features: [
        { name: 'Wardens Bond', level: 1, description: 'A bond.' },
        { name: 'Grove Stride', level: 4, description: 'Step between trees.' },
      ],
    });
  });

  // Only ClassForm disables Cancel while submitting. Cancel is router.back()
  // onto a detail page the cache still serves from before the save, so leaving
  // mid-save and re-editing there would resend the stale feature list over the
  // write still in flight. The other forms leave Cancel enabled.
  it('shows Saving... and withholds Cancel while a class save is in flight', async () => {
    routeApi(
      'class',
      () => Promise.resolve(makeClass()),
      () => new Promise(() => {})
    );
    const user = userEvent.setup();
    renderPage('class');
    await screen.findByRole('textbox', { name: /^Name/ });

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('button', { name: 'Saving...' })).toBeDisabled();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toBeDisabled();
    await user.click(cancel);
    expect(mockBack).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('rejects a typed-but-unpicked origin feat on a background with a toast, without calling the API', async () => {
    routeApi('background', () => Promise.resolve(makeBackground()));
    const user = userEvent.setup();
    renderPage('background');
    await screen.findByLabelText(/^Name/);

    fireEvent.change(screen.getByLabelText(/^Origin feat$/), { target: { value: 'Not A Feat' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Pick the origin feat from the list (SRD or one of your homebrew feats)'
      )
    );
    expect(patchCalls()).toHaveLength(0);
  });
});
