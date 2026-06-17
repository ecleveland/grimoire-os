import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import SpellsStep from '../SpellsStep';
import {
  emptyCharacterFormValues,
  type CharacterFormValues,
} from '@/components/CharacterEditorForm';
import type { SrdClass, SrdSpell } from '@/lib/types';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const SC_BASE = {
  id: 'base',
  hitDie: 'd6',
  primaryAbilities: ['Intelligence'],
  savingThrows: ['Intelligence', 'Wisdom'],
  armorProficiencies: [],
  weaponProficiencies: [],
  skillChoices: [],
  toolProficiencies: [],
  numSkillChoices: 2,
  features: [],
  subclassLevel: 2,
  source: 'SRD',
} satisfies Partial<SrdClass>;

// Wizard — prepared caster: 3 cantrips, prepared = level + INT mod.
const WIZARD: SrdClass = {
  ...SC_BASE,
  id: 'wizard',
  name: 'Wizard',
  spellcasting: {
    ability: 'Intelligence',
    cantripsKnown: { 1: 3 },
    preparedFormula: 'level + intelligence modifier',
  },
};

// Sorcerer — known caster: 4 cantrips, 2 spells known.
const SORCERER: SrdClass = {
  ...SC_BASE,
  id: 'sorcerer',
  name: 'Sorcerer',
  spellcasting: {
    ability: 'Charisma',
    cantripsKnown: { 1: 4 },
    spellsKnown: { 1: 2 },
  },
};

let spellSeq = 0;
function spell(name: string, level: number, over: Partial<SrdSpell> = {}): SrdSpell {
  spellSeq += 1;
  return {
    id: `1111111${spellSeq.toString().padStart(1, '0')}-1111-1111-1111-111111111111`.slice(0, 36),
    name,
    level,
    school: 'Evocation',
    castingTime: '1 action',
    range: '60 feet',
    components: 'V, S',
    duration: 'Instantaneous',
    description: '…',
    classes: ['Wizard', 'Sorcerer'],
    ritual: false,
    concentration: false,
    source: 'SRD',
    ...over,
  };
}

const SPELLS: SrdSpell[] = [
  spell('Fire Bolt', 0),
  spell('Mage Hand', 0),
  spell('Light', 0),
  spell('Prestidigitation', 0),
  spell('Ray of Frost', 0),
  spell('Magic Missile', 1),
  spell('Shield', 1, { components: 'V, S' }),
  spell('Burning Hands', 1),
  spell('Mage Armor', 1, {
    components: 'V, S, M (cured leather)',
    material: 'a piece of cured leather',
  }),
];

// Mirror the real paginated `/srd/spells?class=…&level=…` endpoint: filter the
// fixture by the class + level query params and wrap it in a PaginatedResponse.
function routeApiFetch(classes: SrdClass[], spells: SrdSpell[] = SPELLS) {
  mockApiFetch.mockImplementation((path?: string) => {
    if (path === '/srd/classes') return Promise.resolve(classes);
    if (typeof path === 'string' && path.startsWith('/srd/spells')) {
      const params = new URLSearchParams(path.split('?')[1] ?? '');
      const cls = params.get('class');
      const level = params.get('level');
      const data = spells.filter(
        s => (!cls || s.classes.includes(cls)) && (level === null || s.level === Number(level))
      );
      return Promise.resolve({ data, total: data.length, page: 1, lastPage: 1 });
    }
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
      <SpellsStep value={draft} onChange={patch => setDraft(d => ({ ...d, ...patch }))} />
      <div data-testid="draft-spells">
        {draft.spells.map(s => `${s.level}:${s.name}:${s.prepared ?? ''}`).join(',')}
      </div>
      <div data-testid="draft-ability">{draft.spellcastingAbility}</div>
    </>
  );
}

function renderStep(initial?: Partial<CharacterFormValues>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<Harness initial={initial} />, { wrapper });
}

const spells = () => screen.getByTestId('draft-spells').textContent;

// A wizard with INT 16 (+3) prepares 1 + 3 = 4 level-1 spells.
const wizardDraft: Partial<CharacterFormValues> = {
  class: 'Wizard',
  spellcastingAbility: 'Intelligence',
  level: 1,
  abilityScores: {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 16,
    wisdom: 10,
    charisma: 10,
  },
};

beforeEach(() => {
  mockApiFetch.mockReset();
});

describe('SpellsStep — spell selection', () => {
  it('shows cantrip + prepared-spell sections with the class allowance (prepared caster)', async () => {
    routeApiFetch([WIZARD]);
    renderStep(wizardDraft);
    expect(await screen.findByText(/cantrips/i)).toBeInTheDocument();
    // Prepared caster → "Prepared spells" label and 1 + INT(+3) = 4 allowed.
    expect(screen.getByText(/prepared spells/i)).toBeInTheDocument();
    expect(screen.getByText(/0 of 3 chosen/i)).toBeInTheDocument();
    expect(screen.getByText(/0 of 4 chosen/i)).toBeInTheDocument();
    // The spellcasting ability is affirmed onto the draft.
    expect(screen.getByTestId('draft-ability')).toHaveTextContent('Intelligence');
  });

  it('writes structured SpellEntry rows with prepared flag + catalog metadata', async () => {
    routeApiFetch([WIZARD]);
    const user = userEvent.setup();
    renderStep(wizardDraft);
    await screen.findByRole('checkbox', { name: 'Fire Bolt' });

    await user.click(screen.getByRole('checkbox', { name: 'Fire Bolt' }));
    await user.click(screen.getByRole('checkbox', { name: 'Magic Missile' }));
    // Cantrip → prepared false; leveled → prepared true.
    await waitFor(() => expect(spells()).toBe('0:Fire Bolt:false,1:Magic Missile:true'));
  });

  it('derives the material flag and links the catalog id', async () => {
    routeApiFetch([WIZARD]);
    const user = userEvent.setup();
    // The picker holds its own selection state, so a static value + onChange spy
    // captures exactly what gets written to the draft.
    const onChange = vi.fn();
    const value = { ...emptyCharacterFormValues(), ...wizardDraft };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <SpellsStep value={value} onChange={onChange} />
      </QueryClientProvider>
    );
    await screen.findByRole('checkbox', { name: 'Mage Armor' });
    await user.click(screen.getByRole('checkbox', { name: 'Mage Armor' }));

    const lastSpells = () =>
      (onChange.mock.calls.at(-1)?.[0]?.spells ?? []) as CharacterFormValues['spells'];
    await waitFor(() => expect(lastSpells().some(s => s.name === 'Mage Armor')).toBe(true));
    const entry = lastSpells().find(s => s.name === 'Mage Armor')!;
    expect(entry.material).toBe(true);
    expect(entry.spellId).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.prepared).toBe(true);
  });

  it('enforces the cantrip cap', async () => {
    routeApiFetch([WIZARD]);
    const user = userEvent.setup();
    renderStep(wizardDraft);
    await screen.findByRole('checkbox', { name: 'Fire Bolt' });

    // 3 cantrips allowed — pick three.
    await user.click(screen.getByRole('checkbox', { name: 'Fire Bolt' }));
    await user.click(screen.getByRole('checkbox', { name: 'Mage Hand' }));
    await user.click(screen.getByRole('checkbox', { name: 'Light' }));
    // A fourth cantrip is blocked (the option is disabled at the cap).
    const fourth = screen.getByRole('checkbox', { name: 'Prestidigitation' });
    expect(fourth).toBeDisabled();
    await user.click(fourth);
    expect(fourth).not.toBeChecked();

    // Unchecking one frees a slot again.
    await user.click(screen.getByRole('checkbox', { name: 'Fire Bolt' }));
    expect(screen.getByRole('checkbox', { name: 'Prestidigitation' })).toBeEnabled();
  });

  it('uses the "spells known" label and count for a known caster', async () => {
    routeApiFetch([SORCERER]);
    renderStep({ class: 'Sorcerer', spellcastingAbility: 'Charisma', level: 1 });
    expect(await screen.findByText(/spells known/i)).toBeInTheDocument();
    expect(screen.queryByText(/prepared spells/i)).toBeNull();
    expect(screen.getByText(/0 of 4 chosen/i)).toBeInTheDocument(); // 4 cantrips
    expect(screen.getByText(/0 of 2 chosen/i)).toBeInTheDocument(); // 2 known
  });

  it('shows a friendly note when the class learns no spells at level 1', async () => {
    const ranger: SrdClass = {
      ...SC_BASE,
      id: 'ranger',
      name: 'Ranger',
      spellcasting: { ability: 'Wisdom', spellsKnown: { 1: 0 } },
    };
    routeApiFetch([ranger]);
    renderStep({ class: 'Ranger', spellcastingAbility: 'Wisdom', level: 1 });
    expect(await screen.findByText(/learns no spells at level 1/i)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(spells()).toBe('');
  });
});
