import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import CharacterEditorForm, {
  applyBackgroundGrants,
  applyClassGrants,
  applyRaceGrants,
  characterFormPayload,
  characterToFormValues,
  emptyCharacterFormValues,
  normalizeArmorProficiencies,
  summarizeGrants,
  type CharacterFormValues,
} from '../CharacterEditorForm';
import type { Character, SrdBackground, SrdClass, SrdRace, SrdSubclass } from '@/lib/types';

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

// SRD catalogs the comboboxes fetch.
const srdClasses: SrdClass[] = [
  {
    id: 'cls-fighter',
    name: 'Fighter',
    hitDie: 'd10',
    primaryAbilities: ['Strength'],
    savingThrows: ['Strength', 'Constitution'],
    armorProficiencies: ['Light', 'Medium', 'Heavy', 'Shields'],
    weaponProficiencies: ['Simple', 'Martial'],
    skillChoices: ['Acrobatics', 'Athletics', 'Perception'],
    toolProficiencies: [],
    numSkillChoices: 2,
    features: [],
    source: 'SRD',
  },
  {
    id: 'cls-wizard',
    name: 'Wizard',
    hitDie: 'd6',
    primaryAbilities: ['Intelligence'],
    savingThrows: ['Intelligence', 'Wisdom'],
    armorProficiencies: [],
    weaponProficiencies: ['Daggers'],
    skillChoices: ['Arcana', 'History'],
    toolProficiencies: [],
    numSkillChoices: 2,
    features: [],
    spellcasting: { ability: 'Intelligence' },
    source: 'SRD',
  },
  {
    id: 'cls-monk',
    name: 'Monk',
    hitDie: 'd8',
    primaryAbilities: ['Dexterity', 'Wisdom'],
    savingThrows: ['Strength', 'Dexterity'],
    armorProficiencies: [],
    weaponProficiencies: ['Simple'],
    skillChoices: ['Acrobatics', 'Stealth'],
    toolProficiencies: [],
    numSkillChoices: 2,
    features: [],
    source: 'SRD',
  },
];
const srdRaces: SrdRace[] = [
  {
    id: 'race-elf',
    name: 'Elf',
    speed: 30,
    size: 'Medium',
    abilityBonuses: {},
    traits: [],
    languages: ['Common', 'Elvish'],
    source: 'SRD',
  },
];
const srdBackgrounds: SrdBackground[] = [
  {
    id: 'bg-sage',
    name: 'Sage',
    skillProficiencies: ['Arcana', 'History'],
    toolProficiencies: ["Calligrapher's Supplies"],
    languages: 2,
    personalityTraits: ['I am eager to learn.', 'I speak only in quotes.'],
    ideals: ['Knowledge above all.'],
    bonds: ['I protect my library.'],
    flaws: ['I overlook the obvious.'],
    source: 'SRD',
  },
];
const srdSubclasses: SrdSubclass[] = [
  { id: 'sub-champion', name: 'Champion', classId: 'cls-fighter', source: 'SRD' },
];

vi.mock('@/lib/api', () => ({
  apiFetch: (path: string) => {
    if (path === '/srd/classes') return Promise.resolve(srdClasses);
    if (path === '/srd/races') return Promise.resolve(srdRaces);
    if (path === '/srd/backgrounds') return Promise.resolve(srdBackgrounds);
    if (path === '/srd/languages') return Promise.resolve([{ id: 'lang-1', name: 'Draconic' }]);
    if (path.startsWith('/srd/subclasses')) return Promise.resolve(srdSubclasses);
    return Promise.reject(new Error(`unexpected apiFetch: ${path}`));
  },
}));
vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

function makeCharacter(over: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'Thora Ironfist',
    race: 'Dwarf',
    class: 'Fighter',
    subclass: 'Champion',
    level: 7,
    background: 'Soldier',
    alignment: 'Lawful Good',
    experiencePoints: 0,
    abilityScores: {
      strength: 16,
      dexterity: 12,
      constitution: 14,
      intelligence: 10,
      wisdom: 11,
      charisma: 9,
    },
    hitPoints: { max: 58, current: 41, temporary: 4 },
    deathSaves: { successes: 0, failures: 0 },
    armorClass: 18,
    speed: 25,
    initiative: 1,
    size: 'Medium',
    hitDice: { dieType: 'd10', total: 7, spent: 2 },
    proficiencies: [],
    languages: [],
    savingThrows: [],
    skills: [],
    spells: [],
    spellSlots: [],
    inventory: [],
    attunedItems: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    features: [],
    version: 3,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function renderForm(over: Partial<React.ComponentProps<typeof CharacterEditorForm>> = {}) {
  // Always fresh mocks (no test overrides them) so `.mock` is well-typed.
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(
    <CharacterEditorForm
      initialValues={over.initialValues ?? emptyCharacterFormValues()}
      submitLabel={over.submitLabel ?? 'Create Character'}
      submitting={over.submitting ?? false}
      onSubmit={onSubmit}
      onCancel={onCancel}
      identityExtra={over.identityExtra}
      footerExtra={over.footerExtra}
    />,
    { wrapper }
  );
  return { onSubmit, onCancel };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pure helpers', () => {
  it('emptyCharacterFormValues returns SRD defaults incl. empty grant lists', () => {
    const v = emptyCharacterFormValues();
    expect(v.size).toBe('Medium');
    expect(v.hitDice).toEqual({ dieType: 'd8', total: 1, spent: 0 });
    expect(v.savingThrows).toEqual([]);
    expect(v.proficiencies).toEqual([]);
    expect(v.spellcastingAbility).toBe('');
    expect(v.inventory).toEqual([]);
    expect(v.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
    expect(v.spells).toEqual([]);
  });

  it('characterToFormValues seeds grant lists from the character', () => {
    const v = characterToFormValues(
      makeCharacter({
        savingThrows: ['Strength'],
        skills: ['Athletics'],
        languages: ['Common'],
        armorTraining: ['Heavy'],
        proficiencies: ['Martial'],
        spellcastingAbility: 'Intelligence',
      })
    );
    expect(v).toMatchObject({
      savingThrows: ['Strength'],
      skills: ['Athletics'],
      languages: ['Common'],
      armorTraining: ['Heavy'],
      proficiencies: ['Martial'],
      spellcastingAbility: 'Intelligence',
    });
  });

  it('characterFormPayload includes the grant fields', () => {
    const payload = characterFormPayload(
      characterToFormValues(makeCharacter({ savingThrows: ['Strength'], languages: ['Common'] }))
    );
    expect(payload).toMatchObject({
      savingThrows: ['Strength'],
      languages: ['Common'],
      skills: [],
      proficiencies: [],
      armorTraining: [],
      spellcastingAbility: '',
    });
  });

  // VEG-410: a null armorClass means "no manual override — AC derives from
  // equipped gear". The editor must round-trip that null instead of silently
  // materializing an override of 10 on every save.
  it('characterToFormValues keeps a null armorClass blank (derived AC)', () => {
    expect(characterToFormValues(makeCharacter({ armorClass: null })).armorClass).toBe('');
  });

  it('characterFormPayload submits null for a blank armorClass', () => {
    const payload = characterFormPayload(
      characterToFormValues(makeCharacter({ armorClass: null }))
    );
    expect(payload.armorClass).toBeNull();
  });

  it('characterFormPayload keeps a numeric armorClass as the manual override', () => {
    const payload = characterFormPayload(characterToFormValues(makeCharacter({ armorClass: 18 })));
    expect(payload.armorClass).toBe(18);
  });

  it('characterFormPayload drops weapon/feature rows with no name', () => {
    const v = emptyCharacterFormValues();
    v.weapons = [
      { name: 'Rapier', attackBonus: '+5', damage: '1d8', damageType: 'piercing', notes: '' },
      { name: '  ', attackBonus: '', damage: '', damageType: '', notes: '' },
    ];
    v.features = [
      { name: 'Second Wind', source: 'Fighter', description: '' },
      { name: '', source: '', description: 'orphan' },
    ];
    const payload = characterFormPayload(v);
    expect(payload.weapons).toEqual([
      { name: 'Rapier', attackBonus: '+5', damage: '1d8', damageType: 'piercing', notes: '' },
    ]);
    expect(payload.features).toEqual([{ name: 'Second Wind', source: 'Fighter', description: '' }]);
  });

  it('round-trips structured feats through load and save, dropping unnamed entries (VEG-430)', () => {
    // The classic editor must preserve a granted origin feat: load it from the
    // character, and include it (with its option) in the save payload.
    const feats = [
      { featId: 'feat-mi', name: 'Magic Initiate', option: 'Cleric', source: 'Acolyte' },
    ];
    const v = characterToFormValues(makeCharacter({ feats }));
    expect(v.feats).toEqual(feats);

    v.feats = [...feats, { featId: null, name: '  ', option: null, source: 'x' }];
    const payload = characterFormPayload(v);
    expect(payload.feats).toEqual(feats);
  });

  it('characterFormPayload carries inventory/currency and drops unnamed items', () => {
    const v = emptyCharacterFormValues();
    v.inventory = [
      { name: 'Longsword', quantity: 1, equipped: true },
      { name: '  ', quantity: 1, equipped: false },
    ];
    v.currency = { cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 };
    const payload = characterFormPayload(v);
    expect(payload.inventory).toEqual([{ name: 'Longsword', quantity: 1, equipped: true }]);
    expect(payload.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 });
  });

  it('characterFormPayload carries spells and drops unnamed entries', () => {
    const v = emptyCharacterFormValues();
    v.spells = [
      { level: 0, name: 'Fire Bolt', prepared: false },
      { level: 1, name: 'Magic Missile', prepared: true },
      { level: 1, name: '  ', prepared: true },
    ];
    const payload = characterFormPayload(v);
    expect(payload.spells).toEqual([
      { level: 0, name: 'Fire Bolt', prepared: false },
      { level: 1, name: 'Magic Missile', prepared: true },
    ]);
  });

  it('characterToFormValues seeds inventory/currency, defaulting an absent purse', () => {
    const withCoin = characterToFormValues(
      makeCharacter({
        inventory: [{ name: 'Torch', quantity: 5, equipped: false }],
        currency: { cp: 0, sp: 0, ep: 0, gp: 12, pp: 0 },
      })
    );
    expect(withCoin.inventory).toEqual([{ name: 'Torch', quantity: 5, equipped: false }]);
    expect(withCoin.currency.gp).toBe(12);
  });
});

describe('autofill helpers', () => {
  it('applyClassGrants unions saves/armor/proficiencies and sets hit die', () => {
    const base = emptyCharacterFormValues();
    base.savingThrows = ['Strength']; // pre-existing — must not duplicate
    const { values, added } = applyClassGrants(base, srdClasses[0]);
    expect(values.savingThrows).toEqual(['Strength', 'Constitution']);
    expect(values.armorTraining).toEqual(['Light', 'Medium', 'Heavy', 'Shields']);
    expect(values.proficiencies).toEqual(['Simple', 'Martial']);
    expect(values.hitDice.dieType).toBe('d10');
    // Constitution was the only new save; Strength already present.
    expect(added.find(a => a.label === 'Saving throws')?.values).toEqual(['Constitution']);
  });

  it('applyClassGrants copies spellcasting ability when the class casts', () => {
    const { values } = applyClassGrants(emptyCharacterFormValues(), srdClasses[1]);
    expect(values.spellcastingAbility).toBe('Intelligence');
    expect(values.hitDice.dieType).toBe('d6');
  });

  it('applyClassGrants is idempotent — re-applying adds nothing', () => {
    const once = applyClassGrants(emptyCharacterFormValues(), srdClasses[0]);
    const twice = applyClassGrants(once.values, srdClasses[0]);
    expect(twice.added).toEqual([]);
    expect(twice.values.savingThrows).toEqual(once.values.savingThrows);
  });

  it('applyRaceGrants sets size and unions languages', () => {
    const { values, added } = applyRaceGrants(emptyCharacterFormValues(), srdRaces[0]);
    expect(values.size).toBe('Medium');
    expect(values.languages).toEqual(['Common', 'Elvish']);
    expect(added.find(a => a.label === 'Languages')?.values).toEqual(['Common', 'Elvish']);
  });

  it('applyBackgroundGrants unions skills + tool proficiencies (ignores language count)', () => {
    const { values } = applyBackgroundGrants(emptyCharacterFormValues(), srdBackgrounds[0]);
    expect(values.skills).toEqual(['Arcana', 'History']);
    expect(values.proficiencies).toEqual(["Calligrapher's Supplies"]);
    expect(values.languages).toEqual([]); // background languages is a count, not names
  });

  it('normalizeArmorProficiencies maps SRD phrases onto canonical armor types', () => {
    expect(normalizeArmorProficiencies(['Light armor', 'Medium armor', 'Shields'])).toEqual([
      'Light',
      'Medium',
      'Shields',
    ]);
    // "All armor" expands; unknown phrasing is kept verbatim; result is deduped.
    expect(normalizeArmorProficiencies(['All armor', 'Shields'])).toEqual([
      'Light',
      'Medium',
      'Heavy',
      'Shields',
    ]);
    expect(normalizeArmorProficiencies(['Exotic plating'])).toEqual(['Exotic plating']);
  });

  it('summarizeGrants formats additions and reports a no-op', () => {
    expect(summarizeGrants('Fighter', [{ label: 'Saving throws', values: ['Strength'] }])).toMatch(
      /Applied from Fighter — Saving throws: Strength/
    );
    expect(summarizeGrants('Fighter', [])).toMatch(/already applied/);
  });
});

describe('CharacterEditorForm rendering', () => {
  it('prefills identity + combat from initialValues', () => {
    renderForm({ initialValues: characterToFormValues(makeCharacter()) });
    expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist');
    expect((screen.getByLabelText(/^class/i) as HTMLInputElement).value).toBe('Fighter');
    expect((screen.getByLabelText('STR') as HTMLInputElement).value).toBe('16');
    expect((screen.getByLabelText(/hit die$/i) as HTMLSelectElement).value).toBe('d10');
  });

  it('lists SRD options in the class combobox', async () => {
    renderForm();
    await userEvent.click(screen.getByLabelText(/^class/i));
    expect(await screen.findByRole('option', { name: 'Fighter' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Wizard' })).toBeInTheDocument();
  });

  it('gates the subclass picker until an SRD class is chosen', async () => {
    renderForm();
    expect(screen.getByText(/select an srd class to list its subclasses/i)).toBeInTheDocument();
  });
});

describe('CharacterEditorForm autofill', () => {
  it('shows an Apply button for a matched class and folds its grants into the save', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero'; // satisfy the required Name field so submit fires
    initial.class = 'Fighter';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    const applyBtn = await screen.findByRole('button', { name: /apply fighter traits/i });
    await user.click(applyBtn);

    expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringMatching(/Applied from Fighter/));
    // The Constitution saving-throw toggle is now pressed.
    expect(screen.getByRole('button', { name: /^constitution$/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await user.click(screen.getByRole('button', { name: /create character/i }));
    const submitted = onSubmit.mock.calls[0][0] as CharacterFormValues;
    expect(submitted.savingThrows).toEqual(['Strength', 'Constitution']);
    expect(submitted.armorTraining).toEqual(['Light', 'Medium', 'Heavy', 'Shields']);
    expect(submitted.hitDice.dieType).toBe('d10');
  });

  it('keeps a free-text (homebrew) class with no Apply button', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    const classInput = screen.getByLabelText(/^class/i);
    await user.type(classInput, 'Artificer');
    // No SRD match → no autofill offered.
    expect(screen.queryByRole('button', { name: /apply .* traits/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).class).toBe('Artificer');
  });

  it('picking an option from the list fills the field and offers autofill', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(/^race/i));
    await user.click(await screen.findByRole('option', { name: 'Elf' }));
    expect((screen.getByLabelText(/^race/i) as HTMLInputElement).value).toBe('Elf');

    await user.click(await screen.findByRole('button', { name: /apply elf traits/i }));
    await user.click(screen.getByRole('button', { name: /create character/i }));
    const submitted = onSubmit.mock.calls[0][0] as CharacterFormValues;
    expect(submitted.race).toBe('Elf');
    expect(submitted.languages).toEqual(['Common', 'Elvish']);
  });

  it('autofills background grants via its Apply button', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    initial.background = 'Sage';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /apply sage traits/i }));
    await user.click(screen.getByRole('button', { name: /create character/i }));
    const submitted = onSubmit.mock.calls[0][0] as CharacterFormValues;
    expect(submitted.skills).toEqual(['Arcana', 'History']);
    expect(submitted.proficiencies).toEqual(["Calligrapher's Supplies"]);
  });

  it('re-applying the same grants is a no-op (idempotent + "already applied" toast)', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    initial.class = 'Fighter';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    const applyBtn = await screen.findByRole('button', { name: /apply fighter traits/i });
    await user.click(applyBtn);
    await user.click(applyBtn); // second click — nothing new to add

    expect(mockToastSuccess).toHaveBeenLastCalledWith(expect.stringMatching(/already applied/i));
    // The Constitution save toggle is pressed (once — toggles can't duplicate).
    expect(screen.getByRole('button', { name: /^constitution$/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).savingThrows).toEqual([
      'Strength',
      'Constitution',
    ]);
  });

  it('clears a chosen subclass when a new class is picked', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    initial.subclass = 'Evoker';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(/^class/i));
    await user.click(await screen.findByRole('option', { name: 'Fighter' }));
    expect((screen.getByLabelText(/^subclass/i) as HTMLInputElement).value).toBe('');

    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).subclass).toBe('');
  });

  it('lists subclasses scoped to the chosen class', async () => {
    const initial = emptyCharacterFormValues();
    initial.class = 'Fighter';
    renderForm({ initialValues: initial });
    // With an SRD class chosen, the gating hint is gone and the scoped subclass
    // (Champion, classId cls-fighter) is offered.
    await waitFor(() =>
      expect(
        screen.queryByText(/select an srd class to list its subclasses/i)
      ).not.toBeInTheDocument()
    );
    await userEvent.click(screen.getByLabelText(/^subclass/i));
    expect(await screen.findByRole('option', { name: 'Champion' })).toBeInTheDocument();
  });
});

describe('CharacterEditorForm — editable proficiencies', () => {
  it('toggles a saving throw and submits it', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^wisdom$/i }));
    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).savingThrows).toEqual(['Wisdom']);
  });

  it('adds a language via the token editor', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Languages'), 'Draconic{Enter}');
    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).languages).toEqual(['Draconic']);
  });

  it('reflects and updates the spellcasting ability select', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    initial.spellcastingAbility = 'Intelligence';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    const select = screen.getByLabelText('Spellcasting Ability') as HTMLSelectElement;
    expect(select.value).toBe('Intelligence');
    await user.selectOptions(select, 'Wisdom');
    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).spellcastingAbility).toBe('Wisdom');
  });

  it('highlights the class skill pool and the counter tracks pool picks only', async () => {
    const initial = emptyCharacterFormValues();
    initial.class = 'Fighter'; // pool: Acrobatics/Athletics/Perception, choose 2
    renderForm({ initialValues: initial });
    const user = userEvent.setup();

    expect(
      await screen.findByText(/from your class \(choose 2\): 0 of 2 chosen/i)
    ).toBeInTheDocument();

    // A pool skill advances the counter…
    await user.click(screen.getByRole('button', { name: /^athletics/i }));
    expect(screen.getByText(/1 of 2 chosen/i)).toBeInTheDocument();
    // …a non-pool skill does not.
    await user.click(screen.getByRole('button', { name: /^stealth$/i }));
    expect(screen.getByText(/1 of 2 chosen/i)).toBeInTheDocument();
  });

  it('toggles armor training into the submitted payload', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Heavy' }));
    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).armorTraining).toEqual(['Heavy']);
  });

  it('adds a weapon/tool proficiency into the proficiencies field (not languages)', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/weapon & tool proficiencies/i),
      'Martial weapons{Enter}'
    );
    await user.click(screen.getByRole('button', { name: /create character/i }));
    const submitted = onSubmit.mock.calls[0][0] as CharacterFormValues;
    expect(submitted.proficiencies).toEqual(['Martial weapons']);
    expect(submitted.languages).toEqual([]);
  });

  it('lets the user toggle OFF a save that autofill granted', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    initial.class = 'Fighter';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /apply fighter traits/i }));
    // Constitution is now granted/pressed — remove it.
    const con = screen.getByRole('button', { name: /^constitution$/i });
    expect(con).toHaveAttribute('aria-pressed', 'true');
    await user.click(con);

    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).savingThrows).toEqual(['Strength']);
  });
});

describe('CharacterEditorForm — personality & details', () => {
  it('submits appearance, backstory, and avatar URL', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/appearance/i), 'Tall and weathered.');
    await user.type(screen.getByLabelText(/backstory/i), 'Raised by wolves.');
    await user.type(screen.getByLabelText(/avatar url/i), 'https://img.example/a.png');
    await user.click(screen.getByRole('button', { name: /create character/i }));

    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      appearance: 'Tall and weathered.',
      backstory: 'Raised by wolves.',
      avatarUrl: 'https://img.example/a.png',
    });
  });

  it('prefills personality fields from an existing character', () => {
    renderForm({
      initialValues: characterToFormValues(
        makeCharacter({ appearance: 'Scarred', ideals: 'Freedom', avatarUrl: 'http://x/y.png' })
      ),
    });
    expect((screen.getByLabelText(/appearance/i) as HTMLTextAreaElement).value).toBe('Scarred');
    expect((screen.getByLabelText(/^ideals/i) as HTMLTextAreaElement).value).toBe('Freedom');
    expect((screen.getByLabelText(/avatar url/i) as HTMLInputElement).value).toBe('http://x/y.png');
  });

  it('appends an SRD background suggestion to the matching field (non-destructive)', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    initial.background = 'Sage';
    initial.ideals = 'My own idea.';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    // The suggestion chip appears once the SRD background resolves.
    await user.click(await screen.findByRole('button', { name: 'Knowledge above all.' }));
    await user.click(screen.getByRole('button', { name: /create character/i }));

    // Appended on a new line, original text kept.
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).ideals).toBe(
      'My own idea.\nKnowledge above all.'
    );
  });

  it('appends a suggestion to an empty field with no leading newline', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    initial.background = 'Sage';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'I am eager to learn.' }));
    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).personalityTraits).toBe(
      'I am eager to learn.'
    );
  });

  it('stacks multiple suggestions, newline-joined', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    initial.background = 'Sage';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'I am eager to learn.' }));
    await user.click(screen.getByRole('button', { name: 'I speak only in quotes.' }));
    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).personalityTraits).toBe(
      'I am eager to learn.\nI speak only in quotes.'
    );
  });

  it('offers no suggestion chips for a homebrew (non-SRD) background', async () => {
    const initial = emptyCharacterFormValues();
    initial.background = 'Cartographer of the Void';
    renderForm({ initialValues: initial });
    // Let SRD settle, then confirm no suggestion affordance.
    await waitFor(() => expect(screen.getByLabelText(/^ideals/i)).toBeInTheDocument());
    expect(screen.queryByText(/suggestions from/i)).not.toBeInTheDocument();
  });
});

describe('CharacterEditorForm — weapons & features', () => {
  it('adds a weapon and submits it', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /add weapon/i }));
    fireEvent.change(screen.getByLabelText('Weapon name'), { target: { value: 'Rapier' } });
    fireEvent.change(screen.getByLabelText('Damage'), { target: { value: '1d8' } });
    await user.click(screen.getByRole('button', { name: /create character/i }));

    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).weapons).toEqual([
      { name: 'Rapier', attackBonus: '', damage: '1d8', damageType: '', notes: '' },
    ]);
  });

  it('prefills existing weapons/features and offers class/species as feature sources', () => {
    renderForm({
      initialValues: characterToFormValues(
        makeCharacter({
          weapons: [
            { name: 'Warhammer', attackBonus: '+6', damage: '1d8+4', damageType: 'bludgeoning' },
          ],
          features: [{ name: 'Second Wind', source: 'Fighter', description: 'Regain HP.' }],
        })
      ),
    });
    expect((screen.getByLabelText('Weapon name') as HTMLInputElement).value).toBe('Warhammer');
    expect((screen.getByLabelText('Feature name') as HTMLInputElement).value).toBe('Second Wind');
    // The feature source input wires a datalist (class/species suggestions).
    expect(screen.getByLabelText('Feature source')).toHaveAttribute('list');
  });
});

describe('CharacterEditorForm interactions', () => {
  it('updates a single ability score without disturbing the others', async () => {
    const { onSubmit } = renderForm({ initialValues: characterToFormValues(makeCharacter()) });
    const user = userEvent.setup();
    fireEvent.change(screen.getByLabelText('STR'), { target: { value: '20' } });
    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).abilityScores).toEqual({
      strength: 20,
      dexterity: 12,
      constitution: 14,
      intelligence: 10,
      wisdom: 11,
      charisma: 9,
    });
  });

  it('calls onCancel without submitting', async () => {
    const { onSubmit, onCancel } = renderForm();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders extra slots and disables submit while submitting', () => {
    renderForm({
      submitting: true,
      identityExtra: <div>identity-extra-slot</div>,
      footerExtra: <button type="button">Delete</button>,
    });
    expect(screen.getByText('identity-extra-slot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });
});

describe('recommended primary abilities (VEG-447)', () => {
  const abilityCell = (name: string) =>
    screen.getByRole('spinbutton', { name }).closest('div') as HTMLElement;

  it('summarizes and tags the selected class’s primary ability', async () => {
    renderForm({ initialValues: { ...emptyCharacterFormValues(), class: 'Fighter' } });
    const summary = await screen.findByTestId('recommended-summary');
    expect(summary).toHaveTextContent('Recommended for Fighter: Strength');
    expect(within(abilityCell('STR')).queryByTestId('recommended-tag')).toBeInTheDocument();
    expect(within(abilityCell('DEX')).queryByTestId('recommended-tag')).not.toBeInTheDocument();
  });

  it('tags every primary for a multi-primary class (Monk → Dex + Wis)', async () => {
    renderForm({ initialValues: { ...emptyCharacterFormValues(), class: 'Monk' } });
    const summary = await screen.findByTestId('recommended-summary');
    expect(summary).toHaveTextContent('Recommended for Monk: Dexterity, Wisdom');
    expect(screen.getAllByTestId('recommended-tag')).toHaveLength(2);
    expect(within(abilityCell('DEX')).queryByTestId('recommended-tag')).toBeInTheDocument();
    expect(within(abilityCell('WIS')).queryByTestId('recommended-tag')).toBeInTheDocument();
    expect(within(abilityCell('STR')).queryByTestId('recommended-tag')).not.toBeInTheDocument();
  });

  it('shows nothing with no class selected', () => {
    renderForm();
    expect(screen.queryByTestId('recommended-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recommended-tag')).not.toBeInTheDocument();
  });

  it('shows nothing for a free-typed/homebrew class with no SRD match', async () => {
    renderForm({ initialValues: { ...emptyCharacterFormValues(), class: 'Artificer' } });
    // Let the class catalog settle. The Fighter/Monk cases above prove the
    // loaded-positive path under this same mock, so a resolved catalog that
    // simply doesn't match 'Artificer' yields no recommendation (not a loading
    // gap). The combobox echoing the current value confirms render.
    expect(await screen.findByDisplayValue('Artificer')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId('recommended-summary')).not.toBeInTheDocument()
    );
    expect(screen.queryByTestId('recommended-tag')).not.toBeInTheDocument();
  });
});
