import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import OriginStep from '../OriginStep';
import { DraftProvider, useCharacterDraft } from '../../useCharacterDraft';
import type { GrantRegistry } from '../../grants';
import type { CharacterFormValues } from '@/components/CharacterEditorForm';
import type { SrdBackground, SrdRace } from '@/lib/types';

type Seed = { base?: Partial<CharacterFormValues>; grants?: GrantRegistry };

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const ELF: SrdRace = {
  id: 'elf',
  name: 'Elf',
  speed: 30,
  size: 'Medium',
  abilityBonuses: {},
  traits: [
    { name: 'Darkvision', description: 'See in the dark.' },
    { name: 'Fey Ancestry', description: 'Advantage vs charm.' },
  ],
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

function makeBackground(over: Partial<SrdBackground> = {}): SrdBackground {
  return {
    id: 'acolyte',
    name: 'Acolyte',
    skillProficiencies: ['Insight', 'Religion'],
    toolProficiencies: ["Calligrapher's Supplies"],
    languages: 0,
    originFeat: { id: 'feat-mi', name: 'Magic Initiate' },
    originFeatOption: 'Cleric',
    personalityTraits: [],
    ideals: [],
    bonds: [],
    flaws: [],
    source: 'SRD',
    ...over,
  };
}

const SOLDIER = makeBackground({
  id: 'soldier',
  name: 'Soldier',
  skillProficiencies: ['Athletics', 'Intimidation'],
  toolProficiencies: ['Gaming Set'],
  originFeat: { id: 'feat-sa', name: 'Savage Attacker' },
  originFeatOption: null,
});

function routeApiFetch(races: SrdRace[], backgrounds: SrdBackground[]) {
  mockApiFetch.mockImplementation((path?: string) => {
    if (path === '/srd/races') return Promise.resolve(races);
    if (path === '/srd/backgrounds') return Promise.resolve(backgrounds);
    return Promise.resolve([]);
  });
}

// Drive the real useCharacterDraft hook (the production store) so tests exercise
// the real source-tagged compile/reconcile path. `grants` seeds source slices
// (e.g. a class skill pick) that other steps would have written.
function Harness({ seed }: { seed?: Seed }) {
  const api = useCharacterDraft(seed);
  return (
    <DraftProvider api={api}>
      <OriginStep value={api.draft} onChange={api.onChange} />
      <div data-testid="race">{api.draft.race}</div>
      <div data-testid="speed">{api.draft.speed}</div>
      <div data-testid="size">{api.draft.size}</div>
      <div data-testid="languages">{api.draft.languages.join(',')}</div>
      <div data-testid="skills">{api.draft.skills.join(',')}</div>
      <div data-testid="profs">{api.draft.proficiencies.join(',')}</div>
      <div data-testid="features">
        {api.draft.features.map(f => `${f.name}:${f.source}`).join(',')}
      </div>
      <div data-testid="feats">
        {api.draft.feats.map(f => `${f.name}|${f.option ?? ''}|${f.source}`).join(',')}
      </div>
    </DraftProvider>
  );
}

function renderStep(races: SrdRace[], backgrounds: SrdBackground[], seed?: Seed) {
  routeApiFetch(races, backgrounds);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<Harness seed={seed} />, { wrapper });
}

async function pickFrom(user: ReturnType<typeof userEvent.setup>, label: RegExp, name: string) {
  const input = screen.getByRole('combobox', { name: label });
  await user.clear(input);
  await user.type(input, name);
  await user.click(await screen.findByRole('option', { name }));
}

const pickSpecies = (u: ReturnType<typeof userEvent.setup>, n: string) =>
  pickFrom(u, /species/i, n);
const pickBackground = (u: ReturnType<typeof userEvent.setup>, n: string) =>
  pickFrom(u, /background/i, n);

beforeEach(() => mockApiFetch.mockReset());

describe('OriginStep — background + species', () => {
  it('records race name, speed, size, languages, and traits when a species is selected', async () => {
    const user = userEvent.setup();
    renderStep([ELF], []);

    await pickSpecies(user, 'Elf');

    await waitFor(() => expect(screen.getByTestId('race')).toHaveTextContent('Elf'));
    expect(screen.getByTestId('speed')).toHaveTextContent('30');
    expect(screen.getByTestId('size')).toHaveTextContent('Medium');
    expect(screen.getByTestId('languages')).toHaveTextContent('Common,Elvish');
    // Traits land as features sourced to the race name (so the sheet groups them
    // under Species Traits).
    expect(screen.getByTestId('features')).toHaveTextContent('Darkvision:Elf');
    expect(screen.getByTestId('features')).toHaveTextContent('Fey Ancestry:Elf');
    expect(screen.getByRole('group', { name: /species grants/i })).toBeInTheDocument();
  });

  it('records skill and tool proficiencies when a background is selected', async () => {
    const user = userEvent.setup();
    renderStep([], [makeBackground()]);

    await pickBackground(user, 'Acolyte');

    await waitFor(() => expect(screen.getByTestId('skills')).toHaveTextContent('Insight'));
    expect(screen.getByTestId('skills')).toHaveTextContent('Religion');
    expect(screen.getByTestId('profs')).toHaveTextContent("Calligrapher's Supplies");
    // The grants summary is a role=group region (the e2e + sheet rely on this).
    expect(screen.getByRole('group', { name: /background grants/i })).toBeInTheDocument();
  });

  it('merges background and species grants together when both are picked in one visit', async () => {
    const user = userEvent.setup();
    renderStep([ELF], [makeBackground()]);

    await pickBackground(user, 'Acolyte');
    await pickSpecies(user, 'Elf');

    // Both source effects apply in the same visit without clobbering each other:
    // background skills/tools and species languages/traits all coexist.
    await waitFor(() => expect(screen.getByTestId('features')).toHaveTextContent('Darkvision:Elf'));
    expect(screen.getByTestId('skills')).toHaveTextContent('Insight,Religion');
    expect(screen.getByTestId('profs')).toHaveTextContent("Calligrapher's Supplies");
    expect(screen.getByTestId('languages')).toHaveTextContent('Common,Elvish');
  });

  it('de-duplicates skills already granted by the class', async () => {
    const user = userEvent.setup();
    // Insight is a class skill pick; the Acolyte background also grants it.
    renderStep([], [makeBackground()], { grants: { class: { skills: ['Insight'] } } });

    await pickBackground(user, 'Acolyte');

    // Insight appears once, Religion is added.
    await waitFor(() => expect(screen.getByTestId('skills')).toHaveTextContent('Insight,Religion'));
  });

  it('replaces the previous background grants (keeping class skills) when switched', async () => {
    const user = userEvent.setup();
    renderStep([], [makeBackground(), SOLDIER], { grants: { class: { skills: ['Acrobatics'] } } });

    await pickBackground(user, 'Acolyte');
    await waitFor(() => expect(screen.getByTestId('skills')).toHaveTextContent('Religion'));

    await pickBackground(user, 'Soldier');
    await waitFor(() => expect(screen.getByTestId('skills')).toHaveTextContent('Athletics'));
    const skills = screen.getByTestId('skills');
    // Acolyte's exclusive grants are gone; the class skill is preserved.
    expect(skills).not.toHaveTextContent('Religion');
    expect(skills).toHaveTextContent('Acrobatics');
    expect(skills).toHaveTextContent('Intimidation');
  });

  it('grants the background origin feat (with its option) and shows it in the summary card', async () => {
    const user = userEvent.setup();
    renderStep([], [makeBackground()]);

    await pickBackground(user, 'Acolyte');

    // The structured feat carries name, option, and the background as its source.
    await waitFor(() =>
      expect(screen.getByTestId('feats')).toHaveTextContent('Magic Initiate|Cleric|Acolyte')
    );
    // And it's surfaced in the grants card.
    const card = screen.getByRole('group', { name: /background grants/i });
    expect(card).toHaveTextContent('Magic Initiate (Cleric)');
  });

  it('replaces the previous background feat when the background is switched', async () => {
    const user = userEvent.setup();
    renderStep([], [makeBackground(), SOLDIER]);

    await pickBackground(user, 'Acolyte');
    await waitFor(() => expect(screen.getByTestId('feats')).toHaveTextContent('Magic Initiate'));

    await pickBackground(user, 'Soldier');
    // Savage Attacker (no option) replaces Magic Initiate — no stale grant.
    await waitFor(() =>
      expect(screen.getByTestId('feats')).toHaveTextContent('Savage Attacker||Soldier')
    );
    expect(screen.getByTestId('feats')).not.toHaveTextContent('Magic Initiate');
  });

  it('grants no feat for a background that has no origin feat', async () => {
    const user = userEvent.setup();
    const featless = makeBackground({
      id: 'hermit',
      name: 'Hermit',
      originFeat: null,
      originFeatOption: null,
    });
    renderStep([], [featless]);

    await pickBackground(user, 'Hermit');

    await waitFor(() => expect(screen.getByTestId('skills')).toHaveTextContent('Insight'));
    expect(screen.getByTestId('feats')).toBeEmptyDOMElement();
    expect(screen.getByRole('group', { name: /background grants/i })).toHaveTextContent('Feat—');
  });

  it('does not duplicate species traits when re-entered with a race already set', async () => {
    // Simulate a remount (Origin → later step → Back): the draft already carries
    // the Elf contribution, and OriginStep's refs start fresh.
    renderStep([ELF], [], {
      base: {
        race: 'Elf',
        speed: 30,
        size: 'Medium',
        features: [
          { name: 'Darkvision', description: 'See in the dark.', source: 'Elf' },
          { name: 'Fey Ancestry', description: 'Advantage vs charm.', source: 'Elf' },
        ],
      },
      grants: { species: { languages: ['Common', 'Elvish'] } },
    });

    await waitFor(() =>
      expect(screen.getByRole('group', { name: /species grants/i })).toBeVisible()
    );
    const features = screen.getByTestId('features').textContent ?? '';
    expect(features.match(/Darkvision/g)).toHaveLength(1);
    expect(features.match(/Fey Ancestry/g)).toHaveLength(1);
    // Languages aren't doubled either.
    expect(screen.getByTestId('languages')).toHaveTextContent('Common,Elvish');
  });

  it('clears its species grants when the name is edited to a non-SRD value', async () => {
    const user = userEvent.setup();
    renderStep([ELF], [], { grants: { class: { skills: ['Acrobatics'] } } });

    await pickSpecies(user, 'Elf');
    await waitFor(() => expect(screen.getByTestId('features')).toHaveTextContent('Darkvision:Elf'));

    // Edit the committed name into a non-matching custom value.
    await user.type(screen.getByRole('combobox', { name: /species/i }), 'x');
    await waitFor(() => expect(screen.getByTestId('features')).not.toHaveTextContent('Darkvision'));
    expect(screen.getByTestId('languages')).not.toHaveTextContent('Elvish');
    // An unrelated draft field is untouched.
    expect(screen.getByTestId('skills')).toHaveTextContent('Acrobatics');
  });

  it('keeps the current size when the species size is not a canonical value', async () => {
    const user = userEvent.setup();
    const KOBOLD: SrdRace = { ...ELF, id: 'kobold', name: 'Kobold', size: 'Medium or Small' };
    renderStep([KOBOLD], [], { base: { size: 'Small' } });

    await pickSpecies(user, 'Kobold');

    // "Medium or Small" isn't a canonical Size → size is left as-is; other grants still apply.
    await waitFor(() => expect(screen.getByTestId('race')).toHaveTextContent('Kobold'));
    expect(screen.getByTestId('size')).toHaveTextContent('Small');
    expect(screen.getByTestId('speed')).toHaveTextContent('30');
  });

  it('replaces the previous species traits and languages when switched', async () => {
    const user = userEvent.setup();
    renderStep([ELF, DWARF], []);

    await pickSpecies(user, 'Elf');
    await waitFor(() => expect(screen.getByTestId('features')).toHaveTextContent('Darkvision:Elf'));

    await pickSpecies(user, 'Dwarf');
    await waitFor(() =>
      expect(screen.getByTestId('features')).toHaveTextContent('Dwarven Resilience:Dwarf')
    );
    expect(screen.getByTestId('features')).not.toHaveTextContent('Darkvision');
    // Elvish (Elf-only) is dropped; Dwarvish is added; Common stays once.
    expect(screen.getByTestId('languages')).toHaveTextContent('Common,Dwarvish');
    expect(screen.getByTestId('languages')).not.toHaveTextContent('Elvish');
  });
});
