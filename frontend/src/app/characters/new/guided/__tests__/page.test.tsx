import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import GuidedCharacterPage from '../page';
import type { Character, SrdBackground, SrdClass, SrdRace } from '@/lib/types';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockPush = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
}));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));

// A spellcasting SRD class — drives the skill-count gate and the Spells step.
const WIZARD: SrdClass = {
  id: 'wizard',
  name: 'Wizard',
  hitDie: 'd6',
  primaryAbilities: ['Intelligence'],
  savingThrows: ['Intelligence', 'Wisdom'],
  armorProficiencies: [],
  weaponProficiencies: ['Daggers'],
  skillChoices: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'],
  toolProficiencies: [],
  numSkillChoices: 2,
  features: [],
  spellcasting: { ability: 'Intelligence' },
  subclassLevel: 2,
  source: 'SRD',
};

function makeTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderPage(client: QueryClient = makeTestClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<GuidedCharacterPage />, { wrapper });
}

// The shell hits the API for the Class step's SRD catalog and the final POST.
function routeApiFetch({
  classes = [],
  created = {},
}: { classes?: SrdClass[]; created?: Partial<Character> } = {}) {
  mockApiFetch.mockImplementation((path?: string, options?: { method?: string }) => {
    if (options?.method === 'POST')
      return Promise.resolve({ id: 'char-new', ...created } as Character);
    if (path === '/srd/classes') return Promise.resolve(classes);
    return Promise.resolve([]);
  });
}

function lastPostBody(): Record<string, unknown> {
  const call = mockApiFetch.mock.calls.find(
    ([, opts]) => (opts as { method?: string } | undefined)?.method === 'POST'
  );
  return JSON.parse((call![1] as { body: string }).body);
}

const classInput = () => screen.getByRole('combobox', { name: /^class/i });

// Type a free-text (homebrew) class name — no SRD match, so no skill gate and
// not a spellcaster. Enough to satisfy the Class step for shell-navigation tests.
async function typeClass(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(classInput(), name);
  await waitFor(() => expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled());
}

// Pick an SRD class from the combobox (requires the class to be in the catalog).
async function selectSrdClass(user: ReturnType<typeof userEvent.setup>, name: string) {
  const input = classInput();
  await user.clear(input);
  await user.type(input, name);
  await user.click(await screen.findByRole('option', { name }));
}

async function advanceToReview(user: ReturnType<typeof userEvent.setup>, className = 'Rogue') {
  await typeClass(user, className);
  for (let i = 0; i < 8 && !screen.queryByRole('heading', { name: /review/i }); i++) {
    await user.click(screen.getByRole('button', { name: /^next$/i }));
  }
  await screen.findByRole('heading', { name: /review/i });
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockPush.mockReset();
});

describe('GuidedCharacterPage — wizard shell', () => {
  it('renders the Class step and a progress indicator listing the visible steps', () => {
    routeApiFetch();
    renderPage();

    expect(screen.getByRole('heading', { name: /class/i })).toBeInTheDocument();
    const progress = screen.getByRole('navigation', { name: /progress/i });
    for (const title of ['Class', 'Origin', 'Abilities', 'Equipment', 'Review']) {
      expect(within(progress).getByText(title)).toBeInTheDocument();
    }
    // Spells is hidden until the chosen class is a spellcaster.
    expect(within(progress).queryByText('Spells')).toBeNull();
  });

  it('disables Back on the first step', () => {
    routeApiFetch();
    renderPage();
    expect(screen.getByRole('button', { name: /^back$/i })).toBeDisabled();
  });

  it('gates Next until a class is chosen', async () => {
    routeApiFetch();
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();
    await typeClass(user, 'Fighter');

    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByRole('heading', { name: /origin/i })).toBeInTheDocument();
  });

  it('allows skipping an optional step', async () => {
    routeApiFetch();
    const user = userEvent.setup();
    renderPage();

    await typeClass(user, 'Fighter');
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByRole('heading', { name: /origin/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^skip$/i }));
    expect(screen.getByRole('heading', { name: /abilities/i })).toBeInTheDocument();
  });

  it('preserves draft state when navigating back and forth', async () => {
    routeApiFetch();
    const user = userEvent.setup();
    renderPage();

    await typeClass(user, 'Rogue');
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByRole('heading', { name: /origin/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(classInput()).toHaveValue('Rogue');
  });

  it('navigates via the progress bar — jump back to a visited step, then forward to a reachable one', async () => {
    routeApiFetch();
    const user = userEvent.setup();
    renderPage();
    const progress = screen.getByRole('navigation', { name: /progress/i });

    await typeClass(user, 'Rogue');
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByRole('heading', { name: /origin/i })).toBeInTheDocument();

    await user.click(within(progress).getByRole('button', { name: /class/i }));
    expect(screen.getByRole('heading', { name: /class/i })).toBeInTheDocument();
    expect(classInput()).toHaveValue('Rogue');

    await user.click(within(progress).getByRole('button', { name: /review/i }));
    expect(screen.getByRole('heading', { name: /review/i })).toBeInTheDocument();
  });

  it('gates forward jumps on the progress bar behind incomplete required steps', async () => {
    routeApiFetch();
    const user = userEvent.setup();
    renderPage();
    const progress = screen.getByRole('navigation', { name: /progress/i });

    const reviewBtn = within(progress).getByRole('button', { name: /review/i });
    expect(reviewBtn).toBeDisabled();

    await typeClass(user, 'Bard');
    await waitFor(() => expect(reviewBtn).toBeEnabled());
  });

  it('shows Skip only on optional steps and advances an optional step via Next without input', async () => {
    routeApiFetch();
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByRole('button', { name: /^skip$/i })).toBeNull();

    await typeClass(user, 'Cleric');
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByRole('button', { name: /^skip$/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByRole('heading', { name: /abilities/i })).toBeInTheDocument();
  });

  it('disables the Create button and shows "Creating…" while the request is in flight', async () => {
    let resolvePost!: (c: Character) => void;
    mockApiFetch.mockImplementation((path?: string, options?: { method?: string }) => {
      if (options?.method === 'POST')
        return new Promise<Character>(resolve => {
          resolvePost = resolve;
        });
      if (path === '/srd/classes') return Promise.resolve([]);
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    renderPage();

    await advanceToReview(user);
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Mialee');
    await user.click(screen.getByRole('button', { name: /create character/i }));

    const pending = await screen.findByRole('button', { name: /creating/i });
    expect(pending).toBeDisabled();
    const postCalls = mockApiFetch.mock.calls.filter(
      ([, opts]) => (opts as { method?: string } | undefined)?.method === 'POST'
    );
    expect(postCalls).toHaveLength(1);

    resolvePost({ id: 'char-new' } as Character);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/characters/char-new'));
  });

  it('blocks submission until the Review step minimum (a name) is provided', async () => {
    routeApiFetch();
    const user = userEvent.setup();
    renderPage();

    await advanceToReview(user);
    expect(screen.getByRole('button', { name: /create character/i })).toBeDisabled();

    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Mialee');
    expect(screen.getByRole('button', { name: /create character/i })).toBeEnabled();
  });

  it('submits a minimal valid character (name + class) and redirects to the sheet', async () => {
    routeApiFetch();
    const user = userEvent.setup();
    renderPage();

    await advanceToReview(user, 'Fighter');
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Mialee');
    await user.click(screen.getByRole('button', { name: /create character/i }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/characters/char-new'));
    expect(lastPostBody()).toMatchObject({ name: 'Mialee', class: 'Fighter' });
    expect(mockToastSuccess).toHaveBeenCalledWith('Character created!');
  });

  it('toasts an error and stays on the Review step when creation fails', async () => {
    mockApiFetch.mockImplementation((path?: string, options?: { method?: string }) => {
      if (options?.method === 'POST') return Promise.reject(new Error('Name is required'));
      if (path === '/srd/classes') return Promise.resolve([]);
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    renderPage();

    await advanceToReview(user);
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Mialee');
    await user.click(screen.getByRole('button', { name: /create character/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Name is required'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: /review/i })).toBeInTheDocument();
  });

  it('reveals the Spells step once a spellcasting class is chosen', async () => {
    routeApiFetch({ classes: [WIZARD] });
    const user = userEvent.setup();
    renderPage();
    const progress = screen.getByRole('navigation', { name: /progress/i });
    expect(within(progress).queryByText('Spells')).toBeNull();

    await selectSrdClass(user, 'Wizard');
    await waitFor(() => expect(within(progress).getByText('Spells')).toBeInTheDocument());
  });

  it('removes the Spells step when switching to a non-caster and keeps the wizard on a real step', async () => {
    const FIGHTER: SrdClass = {
      ...WIZARD,
      id: 'fighter',
      name: 'Fighter',
      hitDie: 'd10',
      skillChoices: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Perception'],
      spellcasting: undefined,
    };
    routeApiFetch({ classes: [WIZARD, FIGHTER] });
    const user = userEvent.setup();
    renderPage();
    const progress = screen.getByRole('navigation', { name: /progress/i });

    // Become a caster and walk onto the Spells step.
    await selectSrdClass(user, 'Wizard');
    const skills = screen.getByRole('group', { name: /skills/i });
    await user.click(within(skills).getByRole('button', { name: /arcana/i }));
    await user.click(within(skills).getByRole('button', { name: /history/i }));
    await waitFor(() => expect(within(progress).getByText('Spells')).toBeInTheDocument());
    await user.click(within(progress).getByRole('button', { name: /spells/i }));
    expect(screen.getByRole('heading', { name: /spells/i })).toBeInTheDocument();

    // Jump back to Class and switch to a non-caster — the Spells step vanishes.
    await user.click(within(progress).getByRole('button', { name: /class/i }));
    await selectSrdClass(user, 'Fighter');
    await waitFor(() => expect(within(progress).queryByText('Spells')).toBeNull());
    // The wizard is still on a real (non-blank) step, and navigation still works.
    expect(screen.getByRole('heading', { name: /class/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^next$/i })).toBeInTheDocument();
  });

  it('gates Next on the class skill count for an SRD class', async () => {
    routeApiFetch({ classes: [WIZARD] });
    const user = userEvent.setup();
    renderPage();

    await selectSrdClass(user, 'Wizard');
    const next = screen.getByRole('button', { name: /^next$/i });
    // Class chosen but 0 of 2 skills picked → still gated.
    await waitFor(() => expect(next).toBeDisabled());

    const skills = screen.getByRole('group', { name: /skills/i });
    await user.click(within(skills).getByRole('button', { name: /arcana/i }));
    await user.click(within(skills).getByRole('button', { name: /history/i }));
    await waitFor(() => expect(next).toBeEnabled());
  });
});

// ── VEG-393: source-tagged grants reconcile across step orderings ──────────────
describe('GuidedCharacterPage — cross-step grant reconciliation', () => {
  const FIGHTER: SrdClass = {
    id: 'fighter',
    name: 'Fighter',
    hitDie: 'd10',
    primaryAbilities: ['Strength'],
    savingThrows: ['Strength', 'Constitution'],
    armorProficiencies: ['All armor', 'Shields'],
    weaponProficiencies: ['Simple weapons', 'Martial weapons'],
    skillChoices: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Perception', 'Survival'],
    toolProficiencies: [],
    numSkillChoices: 2,
    features: [],
    subclassLevel: 3,
    source: 'SRD',
  };

  const ELF: SrdRace = {
    id: 'elf',
    name: 'Elf',
    speed: 30,
    size: 'Medium',
    abilityBonuses: {},
    traits: [{ name: 'Darkvision', description: 'See in the dark.' }],
    languages: ['Common', 'Elvish'],
    source: 'SRD',
  };
  const DWARF: SrdRace = {
    id: 'dwarf',
    name: 'Dwarf',
    speed: 25,
    size: 'Medium',
    abilityBonuses: {},
    traits: [{ name: 'Dwarven Resilience', description: 'Advantage vs poison.' }],
    languages: ['Common', 'Dwarvish'],
    source: 'SRD',
  };

  function makeBg(over: Partial<SrdBackground>): SrdBackground {
    return {
      id: 'acolyte',
      name: 'Acolyte',
      skillProficiencies: ['Insight', 'Religion'],
      toolProficiencies: [],
      languages: 0,
      personalityTraits: [],
      ideals: [],
      bonds: [],
      flaws: [],
      source: 'SRD',
      ...over,
    };
  }
  const ACOLYTE = makeBg({});
  const SOLDIER = makeBg({
    id: 'soldier',
    name: 'Soldier',
    skillProficiencies: ['Athletics', 'Intimidation'],
    toolProficiencies: ['Gaming Set'],
  });

  function routeSrd({
    classes = [],
    races = [],
    backgrounds = [],
  }: { classes?: SrdClass[]; races?: SrdRace[]; backgrounds?: SrdBackground[] } = {}) {
    mockApiFetch.mockImplementation((path?: string, options?: { method?: string }) => {
      if (options?.method === 'POST') return Promise.resolve({ id: 'char-new' } as Character);
      if (path === '/srd/classes') return Promise.resolve(classes);
      if (path === '/srd/races') return Promise.resolve(races);
      if (path === '/srd/backgrounds') return Promise.resolve(backgrounds);
      return Promise.resolve([]);
    });
  }

  const next = () => screen.getByRole('button', { name: /^next$/i });

  async function pickClassSkill(user: ReturnType<typeof userEvent.setup>, name: string) {
    const skills = screen.getByRole('group', { name: /skills/i });
    await user.click(within(skills).getByRole('button', { name: new RegExp(`^${name}$`, 'i') }));
  }

  async function pickOrigin(user: ReturnType<typeof userEvent.setup>, label: RegExp, name: string) {
    const input = screen.getByRole('combobox', { name: label });
    await user.clear(input);
    await user.type(input, name);
    await user.click(await screen.findByRole('option', { name }));
  }

  async function walkToReviewAndSubmit(user: ReturnType<typeof userEvent.setup>) {
    for (let i = 0; i < 8 && !screen.queryByRole('heading', { name: /review/i }); i++) {
      await user.click(next());
    }
    await screen.findByRole('heading', { name: /review/i });
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Mialee');
    await user.click(screen.getByRole('button', { name: /create character/i }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/characters/char-new'));
  }

  it('keeps a class-picked skill when a background that also granted it is switched away (bug 1)', async () => {
    routeSrd({ classes: [FIGHTER], races: [], backgrounds: [ACOLYTE, SOLDIER] });
    const user = userEvent.setup();
    renderPage();

    await selectSrdClass(user, 'Fighter');
    await pickClassSkill(user, 'Insight'); // also granted by Acolyte
    await pickClassSkill(user, 'Perception');
    await waitFor(() => expect(next()).toBeEnabled());
    await user.click(next());

    // Origin: take Acolyte (grants Insight + Religion), then switch to Soldier.
    await pickOrigin(user, /background/i, 'Acolyte');
    await waitFor(() =>
      expect(screen.getByRole('group', { name: /background grants/i })).toBeInTheDocument()
    );
    await pickOrigin(user, /background/i, 'Soldier');

    await walkToReviewAndSubmit(user);
    const skills = lastPostBody().skills as string[];
    // The class pick survives the Acolyte→Soldier switch; Acolyte's exclusive
    // Religion is gone.
    expect(skills).toContain('Insight');
    expect(skills).not.toContain('Religion');
  });

  it('does not drop a background tool proficiency when revisiting the Class step (bug 2)', async () => {
    routeSrd({ classes: [FIGHTER], races: [], backgrounds: [SOLDIER] });
    const user = userEvent.setup();
    renderPage();

    await selectSrdClass(user, 'Fighter');
    await pickClassSkill(user, 'Athletics');
    await pickClassSkill(user, 'Perception');
    await user.click(next());

    await pickOrigin(user, /background/i, 'Soldier'); // grants the "Gaming Set" tool prof
    await waitFor(() =>
      expect(screen.getByRole('group', { name: /background grants/i })).toBeInTheDocument()
    );

    // Go back to Class (ClassStep remounts; its grants re-apply). Before the fix,
    // the wholesale proficiency replace clobbered the background's tool prof.
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    expect(screen.getByRole('heading', { name: /class/i })).toBeInTheDocument();

    await walkToReviewAndSubmit(user);
    const profs = lastPostBody().proficiencies as string[];
    expect(profs).toContain('Gaming Set'); // background's tool prof survived
    expect(profs).toContain('Martial weapons'); // class profs still present
  });

  it('removes the previous species languages when switching species after a remount (bug 3)', async () => {
    routeSrd({ classes: [FIGHTER], races: [ELF, DWARF], backgrounds: [] });
    const user = userEvent.setup();
    renderPage();

    await selectSrdClass(user, 'Fighter');
    await pickClassSkill(user, 'Athletics');
    await pickClassSkill(user, 'Perception');
    await user.click(next());

    await pickOrigin(user, /species/i, 'Elf');
    const elfSummary = await screen.findByRole('group', { name: /species grants/i });
    expect(within(elfSummary).getByText(/Common, Elvish/)).toBeInTheDocument();

    // Leave Origin and come back (OriginStep remounts — the old ref-based code
    // lost the previous species' contribution here).
    await user.click(next());
    expect(screen.getByRole('heading', { name: /abilities/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^back$/i }));

    await pickOrigin(user, /species/i, 'Dwarf');
    const dwarfSummary = await screen.findByRole('group', { name: /species grants/i });
    await waitFor(() =>
      expect(within(dwarfSummary).getByText(/Common, Dwarvish/)).toBeInTheDocument()
    );
    expect(within(dwarfSummary).queryByText(/Elvish/)).toBeNull();
  });

  it('keeps the class skill picks when navigating back to the Class step (revisit idempotency)', async () => {
    routeSrd({ classes: [FIGHTER], races: [], backgrounds: [] });
    const user = userEvent.setup();
    renderPage();

    await selectSrdClass(user, 'Fighter');
    await pickClassSkill(user, 'Athletics');
    await pickClassSkill(user, 'Insight');
    await waitFor(() => expect(next()).toBeEnabled());
    await user.click(next());
    expect(screen.getByRole('heading', { name: /origin/i })).toBeInTheDocument();

    // Back to Class: the picks must survive the remount (no skills: [] reset).
    await user.click(screen.getByRole('button', { name: /^back$/i }));
    const skills = await screen.findByRole('group', { name: /skills/i });
    expect(within(skills).getByRole('button', { name: /^athletics$/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(skills).getByRole('button', { name: /^insight$/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(next()).toBeEnabled();
  });
});
