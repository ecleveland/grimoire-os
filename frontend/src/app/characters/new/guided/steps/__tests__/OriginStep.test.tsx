import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import OriginStep from '../OriginStep';
import {
  emptyCharacterFormValues,
  type CharacterFormValues,
} from '@/components/CharacterEditorForm';
import type { SrdBackground, SrdRace } from '@/lib/types';

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
});

function routeApiFetch(races: SrdRace[], backgrounds: SrdBackground[]) {
  mockApiFetch.mockImplementation((path?: string) => {
    if (path === '/srd/races') return Promise.resolve(races);
    if (path === '/srd/backgrounds') return Promise.resolve(backgrounds);
    return Promise.resolve([]);
  });
}

function Harness({ initial }: { initial?: Partial<CharacterFormValues> }) {
  const [draft, setDraft] = useState<CharacterFormValues>(() => ({
    ...emptyCharacterFormValues(),
    ...initial,
  }));
  return (
    <>
      <OriginStep value={draft} onChange={patch => setDraft(d => ({ ...d, ...patch }))} />
      <div data-testid="race">{draft.race}</div>
      <div data-testid="speed">{draft.speed}</div>
      <div data-testid="size">{draft.size}</div>
      <div data-testid="languages">{draft.languages.join(',')}</div>
      <div data-testid="skills">{draft.skills.join(',')}</div>
      <div data-testid="profs">{draft.proficiencies.join(',')}</div>
      <div data-testid="features">{draft.features.map(f => `${f.name}:${f.source}`).join(',')}</div>
    </>
  );
}

function renderStep(
  races: SrdRace[],
  backgrounds: SrdBackground[],
  initial?: Partial<CharacterFormValues>
) {
  routeApiFetch(races, backgrounds);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<Harness initial={initial} />, { wrapper });
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

  it('de-duplicates skills already granted by the class', async () => {
    const user = userEvent.setup();
    // Insight is a class skill pick; the Acolyte background also grants it.
    renderStep([], [makeBackground()], { skills: ['Insight'] });

    await pickBackground(user, 'Acolyte');

    // Insight appears once, Religion is added.
    await waitFor(() => expect(screen.getByTestId('skills')).toHaveTextContent('Insight,Religion'));
  });

  it('replaces the previous background grants (keeping class skills) when switched', async () => {
    const user = userEvent.setup();
    renderStep([], [makeBackground(), SOLDIER], { skills: ['Acrobatics'] });

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
