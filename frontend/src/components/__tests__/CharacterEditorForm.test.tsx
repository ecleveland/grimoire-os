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
import { MAX_ARMOR_CLASS, MAX_INITIATIVE_BONUS, MAX_SPEED } from '@grimoire-os/shared';

const mockToastSuccess = vi.fn();
const mockToastError = vi.fn();

// SRD catalogs the comboboxes fetch.
const srdClasses: SrdClass[] = [
  {
    id: 'cls-fighter',
    name: 'Fighter',
    contentSource: 'srd',
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
    contentSource: 'srd',
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
    contentSource: 'srd',
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
    contentSource: 'srd',
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
    // No die yet (VEG-530) — see the dedicated block below.
    expect(v.hitDice).toBeNull();
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

  // VEG-524: same contract as backgroundId below, for class. A loaded character
  // carries classId so its hit die and per-level features resolve by id even
  // when a homebrew class reuses the SRD name (legal since VEG-506).
  it('characterToFormValues seeds classId from the character', () => {
    const v = characterToFormValues(makeCharacter({ classId: 'cls-123' }));
    expect(v.classId).toBe('cls-123');
  });

  it('characterToFormValues leaves classId blank when the character has none', () => {
    const v = characterToFormValues(makeCharacter({ classId: undefined }));
    expect(v.classId).toBe('');
  });

  it('characterFormPayload sends the selected classId', () => {
    const payload = characterFormPayload(
      characterToFormValues(makeCharacter({ classId: 'cls-123' }))
    );
    expect(payload.classId).toBe('cls-123');
  });

  // Null, not '': a free-typed class has no catalog row, and the column is a
  // soft ref that should hold an id or nothing.
  it('characterFormPayload sends null for a free-typed class (no id)', () => {
    const payload = characterFormPayload(
      characterToFormValues(makeCharacter({ classId: undefined }))
    );
    expect(payload.classId).toBeNull();
  });

  // VEG-476: a loaded character now carries backgroundId so its background
  // resolves by id even when the display name collides with a homebrew row
  // (VEG-473). The editor must seed it on load and send it on save.
  it('characterToFormValues seeds backgroundId from the character', () => {
    const v = characterToFormValues(makeCharacter({ backgroundId: 'bg-123' }));
    expect(v.backgroundId).toBe('bg-123');
  });

  it('characterToFormValues leaves backgroundId blank when the character has none', () => {
    const v = characterToFormValues(makeCharacter({ backgroundId: undefined }));
    expect(v.backgroundId).toBe('');
  });

  it('characterFormPayload sends the selected backgroundId', () => {
    const payload = characterFormPayload(
      characterToFormValues(makeCharacter({ backgroundId: 'bg-123' }))
    );
    expect(payload.backgroundId).toBe('bg-123');
  });

  it('characterFormPayload sends null for a free-typed background (no id)', () => {
    const payload = characterFormPayload(
      characterToFormValues(makeCharacter({ backgroundId: undefined }))
    );
    expect(payload.backgroundId).toBeNull();
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

  // VEG-530. `hitDice` used to be non-nullable here, filled with a d8 on load
  // and sent on every save, so opening the editor on a character that had no hit
  // dice and saving ANY unrelated field persisted a pool nobody chose. That
  // stored die then outranked the VEG-528 level-up picker, so the one place
  // that asks which die a character uses never appeared again — which is how
  // VEG-528's own advice ("re-pick your class in the editor") defeated its fix.
  describe('an unrecorded hit-dice pool stays unrecorded (VEG-530)', () => {
    it('characterToFormValues keeps a null hitDice null instead of inventing a d8', () => {
      expect(characterToFormValues(makeCharacter({ hitDice: null })).hitDice).toBeNull();
    });

    // The acceptance regression. `toBeUndefined` would also pass if the key were
    // present-and-undefined, which JSON.stringify drops anyway — but asserting on
    // the key itself is what pins the server-seed contract: a create that sends
    // `hitDice: null` explicitly tells the backend "no pool", and it obeys.
    it('characterFormPayload omits the key entirely rather than sending null', () => {
      const payload = characterFormPayload(characterToFormValues(makeCharacter({ hitDice: null })));
      expect(payload.hitDice).toBeUndefined();
      expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty('hitDice');
    });

    it('characterFormPayload still round-trips a pool the character has', () => {
      const hitDice = { dieType: 'd10' as const, total: 7, spent: 2 };
      const payload = characterFormPayload(characterToFormValues(makeCharacter({ hitDice })));
      expect(payload.hitDice).toEqual(hitDice);
    });

    it('a blank create form starts with no die rather than a d8', () => {
      expect(emptyCharacterFormValues().hitDice).toBeNull();
    });

    // Folding a class in is one of the two ways a die gets recorded here, and it
    // has to build the whole pool, not just stamp a dieType onto nothing.
    it('applyClassGrants records a full pool sized to the level when there is none', () => {
      const base = { ...emptyCharacterFormValues(), level: 4 };
      const { values, added } = applyClassGrants(base, srdClasses[0]);
      expect(values.hitDice).toEqual({ dieType: 'd10', total: 4, spent: 0 });
      expect(added.find(a => a.label === 'Hit die')?.values).toEqual(['d10']);
    });

    // The Level field coerces a cleared input to 0 (`Number('')`) and `min={1}`
    // is only a browser hint, so this path needs the same floor the Hit Die
    // control has. It did not have it: clearing Level and clicking "Apply
    // <Class> traits" recorded a pool of zero dice, which renders 0/0, leaves
    // nothing to spend on a rest, and — being a truthy pool — suppresses the
    // level-up picker that exists to repair exactly this.
    it('applyClassGrants floors the pool at one die when the level field is blank', () => {
      const base = { ...emptyCharacterFormValues(), level: 0 };
      const { values } = applyClassGrants(base, srdClasses[0]);
      expect(values.hitDice).toEqual({ dieType: 'd10', total: 1, spent: 0 });
    });

    // The pool a character already has is its own record, spent dice included. A
    // class whose die the sheet cannot use leaves all three fields alone, and
    // must not report a grant it did not make.
    it('applyClassGrants leaves an existing pool untouched for an unusable class die', () => {
      const base = {
        ...emptyCharacterFormValues(),
        level: 5,
        hitDice: { dieType: 'd6' as const, total: 5, spent: 2 },
      };
      const { values, added } = applyClassGrants(base, { ...srdClasses[0], hitDie: 'd100' });
      expect(values.hitDice).toEqual({ dieType: 'd6', total: 5, spent: 2 });
      expect(added.find(a => a.label === 'Hit die')).toBeUndefined();
    });

    // The pool is the player's record, including how many dice they have spent.
    it('applyClassGrants changes only the die on a pool that already exists', () => {
      const base = {
        ...emptyCharacterFormValues(),
        level: 4,
        hitDice: { dieType: 'd6' as const, total: 9, spent: 5 },
      };
      const { values } = applyClassGrants(base, srdClasses[0]);
      expect(values.hitDice).toEqual({ dieType: 'd10', total: 9, spent: 5 });
    });

    // A class die the sheet cannot use must not become a pool, and must not be
    // reported as a grant that was made.
    it.each([
      // Legal for the content DTO (@IsIn(DIE_TYPES)) but not a hit die: a d100
      // pool would offer +51 a level and no picker can express it.
      ['d100'],
      ['not-a-die'],
    ])('applyClassGrants declines a %s class die', hitDie => {
      const junk = { ...srdClasses[0], hitDie };
      const { values, added } = applyClassGrants(emptyCharacterFormValues(), junk);
      expect(values.hitDice).toBeNull();
      expect(added.find(a => a.label === 'Hit die')).toBeUndefined();
    });
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

  it('persists a selected backgroundId alongside the display name (VEG-476)', () => {
    const v = characterToFormValues(makeCharacter({ background: 'Sage' }));
    v.backgroundId = 'bg-sage';
    const payload = characterFormPayload(v);
    expect(payload.backgroundId).toBe('bg-sage');
    expect(payload.background).toBe('Sage');
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
    expect(values.hitDice?.dieType).toBe('d10');
    // Constitution was the only new save; Strength already present.
    expect(added.find(a => a.label === 'Saving throws')?.values).toEqual(['Constitution']);
  });

  it('applyClassGrants copies spellcasting ability when the class casts', () => {
    const { values } = applyClassGrants(emptyCharacterFormValues(), srdClasses[1]);
    expect(values.spellcastingAbility).toBe('Intelligence');
    expect(values.hitDice?.dieType).toBe('d6');
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

  // VEG-452 made the stored column an additive bonus over the Dex modifier. This
  // label and its helper text are the only place the UI says so, so a revert to
  // the old bare "Initiative" label would otherwise ship green — and would leave
  // players entering a total into a field that now adds.
  it('labels initiative as a bonus and says what it adds to', () => {
    renderForm();
    expect(screen.getByLabelText('Initiative Bonus')).toBeInTheDocument();
    expect(screen.getByText(/added to your dexterity modifier/i)).toBeInTheDocument();
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
    expect(submitted.hitDice?.dieType).toBe('d10');
  });

  // The rendered half of VEG-530. The helper tests above pin the data shape; these
  // pin what a player actually sees and does on a sheet with no hit dice.
  describe('the Hit Die control on a sheet with no pool (VEG-530)', () => {
    const noDice = () =>
      characterToFormValues(makeCharacter({ hitDice: null, level: 3, class: 'Ranger' }));

    it('shows the pool as unrecorded rather than as a d8', async () => {
      renderForm({ initialValues: noDice(), submitLabel: 'Save Changes' });

      const select = screen.getByLabelText(/^hit die$/i) as HTMLSelectElement;
      expect(select.value).toBe('');
      expect(within(select).getByRole('option', { name: /not recorded/i })).toBeDisabled();
      // A total with no die is not a pool, and a 0 would read as "none left".
      expect(screen.getByLabelText(/hit dice total/i)).toHaveValue(null);
      expect(screen.getByLabelText(/hit dice total/i)).toBeDisabled();
      expect(screen.getByLabelText(/hit dice spent/i)).toBeDisabled();
    });

    // The whole point of the ticket: this is the save that used to write a d8.
    it('saves an unrelated edit without inventing a pool', async () => {
      const { onSubmit } = renderForm({
        initialValues: noDice(),
        submitLabel: 'Save Changes',
      });
      const user = userEvent.setup();

      await user.clear(screen.getByLabelText(/^name/i));
      await user.type(screen.getByLabelText(/^name/i), 'Renamed');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      const submitted = onSubmit.mock.calls[0][0] as CharacterFormValues;
      expect(submitted.name).toBe('Renamed');
      expect(submitted.hitDice).toBeNull();
      expect(characterFormPayload(submitted).hitDice).toBeUndefined();
    });

    // Recording one is a deliberate act, and it builds the pool the character's
    // level implies rather than an empty shell the player has to fill in.
    it('records a full pool at the character’s level when a die is picked', async () => {
      const { onSubmit } = renderForm({
        initialValues: noDice(),
        submitLabel: 'Save Changes',
      });
      const user = userEvent.setup();

      await user.selectOptions(screen.getByLabelText(/^hit die$/i), 'd10');

      expect(screen.getByLabelText(/hit dice total/i)).toHaveValue(3);
      expect(screen.getByLabelText(/hit dice total/i)).toBeEnabled();

      await user.click(screen.getByRole('button', { name: /save changes/i }));
      const submitted = onSubmit.mock.calls[0][0] as CharacterFormValues;
      expect(submitted.hitDice).toEqual({ dieType: 'd10', total: 3, spent: 0 });
    });

    // The last un-narrowed recording path (found by the pre-commit review). Every
    // other write refuses a non-hit die — `isHitDie` on the server, `asHitDie` in
    // the grant helpers, `hitDie IN (…)` in the migration — and this control now
    // builds a whole pool, so leaving it on DIE_TYPES let one d100 pick persist
    // `{dieType:'d100'}`. `LevelUpDialog` reads a stored die without narrowing,
    // so that pool then skips the picker and offers +51 a level into a permanent
    // maximum, which is the exact failure the other guards exist to stop.
    it('offers only real hit dice, not the d20 and d100 in DIE_TYPES', () => {
      renderForm({ initialValues: noDice(), submitLabel: 'Save Changes' });

      const select = screen.getByLabelText(/^hit die$/i) as HTMLSelectElement;
      const dice = within(select)
        .getAllByRole('option')
        .map(o => (o as HTMLOptionElement).value)
        .filter(v => v !== '');
      expect(dice).toEqual(['d4', 'd6', 'd8', 'd10', 'd12']);
    });

    // Narrowing the list must not strand a sheet that already carries an odd die
    // — a pre-VEG-530 pool, or one a DM set by hand. It stays selectable, so the
    // editor renders it truthfully rather than silently showing a different die.
    it('keeps a stored die that is outside the offered list selectable', () => {
      renderForm({
        initialValues: characterToFormValues(
          makeCharacter({ hitDice: { dieType: 'd100', total: 5, spent: 0 } })
        ),
        submitLabel: 'Save Changes',
      });

      const select = screen.getByLabelText(/^hit die$/i) as HTMLSelectElement;
      expect(select.value).toBe('d100');
      expect(
        within(select)
          .getAllByRole('option')
          .map(o => (o as HTMLOptionElement).value)
      ).toEqual(['d4', 'd6', 'd8', 'd10', 'd12', 'd100']);
    });

    // The Level field coerces a cleared input to 0 (`Number('')`), and `min={1}`
    // is only an HTML hint. Sizing the new pool straight off it recorded
    // `{total: 0}`, which renders as 0/0 and leaves nothing to spend on a rest.
    it('records at least one die when the level field is blank', async () => {
      renderForm({ initialValues: noDice(), submitLabel: 'Save Changes' });
      const user = userEvent.setup();

      await user.clear(screen.getByLabelText(/^level$/i));
      await user.selectOptions(screen.getByLabelText(/^hit die$/i), 'd10');

      expect(screen.getByLabelText(/hit dice total/i)).toHaveValue(1);
    });

    // Changing the die on an existing pool must not resize it or refund spent
    // dice. Every other selectOptions test here starts from an unrecorded pool,
    // so nothing pinned this.
    it('changes only the die on a pool that already exists', async () => {
      const { onSubmit } = renderForm({
        initialValues: characterToFormValues(
          makeCharacter({ level: 7, hitDice: { dieType: 'd8', total: 3, spent: 1 } })
        ),
        submitLabel: 'Save Changes',
      });
      const user = userEvent.setup();

      await user.selectOptions(screen.getByLabelText(/^hit die$/i), 'd12');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      const submitted = onSubmit.mock.calls[0][0] as CharacterFormValues;
      expect(submitted.hitDice).toEqual({ dieType: 'd12', total: 3, spent: 1 });
    });

    // Once a pool exists the placeholder is gone, so the control cannot be used
    // to un-record one — which the payload could not persist anyway.
    it('drops the unrecorded option once a die is on the sheet', async () => {
      renderForm({
        initialValues: characterToFormValues(
          makeCharacter({ hitDice: { dieType: 'd8', total: 3, spent: 1 } })
        ),
        submitLabel: 'Save Changes',
      });

      const select = screen.getByLabelText(/^hit die$/i) as HTMLSelectElement;
      expect(select.value).toBe('d8');
      expect(within(select).queryByRole('option', { name: /not recorded/i })).toBeNull();
    });
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

  it('resolves a duplicate-named background by id when picked from the list (VEG-473)', async () => {
    // A homebrew "Sage" shares the SRD name but grants different skills. Both rows
    // carry a source suffix so they're distinguishable; picking captures the id.
    const homebrewSage: SrdBackground = {
      ...srdBackgrounds[0],
      id: 'bg-sage-hb',
      contentSource: 'homebrew',
      skillProficiencies: ['Deception', 'Stealth'],
      toolProficiencies: ["Thieves' Tools"],
    };
    srdBackgrounds.push(homebrewSage);
    try {
      const initial = emptyCharacterFormValues();
      initial.name = 'Hero';
      const { onSubmit } = renderForm({ initialValues: initial });
      const user = userEvent.setup();

      await user.click(screen.getByLabelText(/^background/i));
      await user.click(await screen.findByRole('option', { name: 'Sage (Homebrew)' }));
      // The committed value stays the bare name; the id disambiguates behind it.
      expect((screen.getByLabelText(/^background/i) as HTMLInputElement).value).toBe('Sage');

      // The Apply button folds the HOMEBREW Sage's grants (resolved by id), not the SRD one's.
      await user.click(await screen.findByRole('button', { name: /apply sage traits/i }));
      await user.click(screen.getByRole('button', { name: /create character/i }));
      const submitted = onSubmit.mock.calls[0][0] as CharacterFormValues;
      expect(submitted.skills).toEqual(['Deception', 'Stealth']);
      expect(submitted.proficiencies).toEqual(["Thieves' Tools"]);
      expect(submitted.background).toBe('Sage');
    } finally {
      srdBackgrounds.pop();
    }
  });

  // VEG-524. The pure-function tests above cover characterToFormValues and
  // characterFormPayload, but not the component wiring that has to call them
  // with the right id — reverting the picker to its pre-fix form left the entire
  // frontend suite green. These are the tests that notice.
  it('resolves a duplicate-named class by id when picked from the list (VEG-524)', async () => {
    // A homebrew "Fighter" shares the SRD name but grants a different hit die
    // and different armor/weapon training.
    const homebrewFighter: SrdClass = {
      ...srdClasses[0],
      id: 'cls-fighter-hb',
      contentSource: 'homebrew',
      hitDie: 'd12',
      armorProficiencies: [],
      weaponProficiencies: ['Improvised'],
      savingThrows: ['Dexterity', 'Charisma'],
    };
    srdClasses.push(homebrewFighter);
    try {
      const initial = emptyCharacterFormValues();
      initial.name = 'Hero';
      const { onSubmit } = renderForm({ initialValues: initial });
      const user = userEvent.setup();

      await user.click(screen.getByLabelText(/^class/i));
      await user.click(await screen.findByRole('option', { name: 'Fighter (Homebrew)' }));
      // The committed value stays the bare name; the id disambiguates behind it.
      expect((screen.getByLabelText(/^class/i) as HTMLInputElement).value).toBe('Fighter');

      // Grants come off the HOMEBREW row, resolved by id, not the SRD one.
      await user.click(await screen.findByRole('button', { name: /apply fighter traits/i }));
      await user.click(screen.getByRole('button', { name: /create character/i }));

      const submitted = onSubmit.mock.calls[0][0] as CharacterFormValues;
      expect(submitted.classId).toBe('cls-fighter-hb');
      expect(submitted.class).toBe('Fighter');
      expect(submitted.savingThrows).toEqual(['Dexterity', 'Charisma']);
      expect(submitted.hitDice?.dieType).toBe('d12');
    } finally {
      srdClasses.pop();
    }
  });

  it('picks the SRD row when that is the one selected (VEG-524)', async () => {
    const homebrewFighter: SrdClass = {
      ...srdClasses[0],
      id: 'cls-fighter-hb',
      contentSource: 'homebrew',
      hitDie: 'd12',
      savingThrows: ['Dexterity', 'Charisma'],
    };
    // Homebrew FIRST, the array order that made the old name-based `.find`
    // return the wrong row.
    srdClasses.unshift(homebrewFighter);
    try {
      const initial = emptyCharacterFormValues();
      initial.name = 'Hero';
      const { onSubmit } = renderForm({ initialValues: initial });
      const user = userEvent.setup();

      await user.click(screen.getByLabelText(/^class/i));
      await user.click(await screen.findByRole('option', { name: 'Fighter (SRD)' }));
      await user.click(await screen.findByRole('button', { name: /apply fighter traits/i }));
      await user.click(screen.getByRole('button', { name: /create character/i }));

      const submitted = onSubmit.mock.calls[0][0] as CharacterFormValues;
      expect(submitted.classId).toBe('cls-fighter');
      expect(submitted.savingThrows).toEqual(['Strength', 'Constitution']);
      expect(submitted.hitDice?.dieType).toBe('d10');
    } finally {
      srdClasses.shift();
    }
  });

  // The only id-clearing site in the classic editor. Typing over a resolved name
  // must drop the id, or a stale one keeps resolving to a class the user has
  // edited away from.
  it('clears the captured classId when the name is typed over (VEG-524)', async () => {
    const initial = emptyCharacterFormValues();
    initial.name = 'Hero';
    const { onSubmit } = renderForm({ initialValues: initial });
    const user = userEvent.setup();

    await user.click(screen.getByLabelText(/^class/i));
    await user.click(await screen.findByRole('option', { name: 'Fighter' }));
    await user.type(screen.getByLabelText(/^class/i), ' the Bold');
    await user.click(screen.getByRole('button', { name: /create character/i }));

    const submitted = onSubmit.mock.calls[0][0] as CharacterFormValues;
    expect(submitted.class).toBe('Fighter the Bold');
    // '' in form state; characterFormPayload converts it to null at the wire.
    expect(submitted.classId).toBe('');
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

// VEG-500. VEG-496 bounded these three columns at the DTO write boundary, so a
// value the editor accepts but the server refuses now surfaces as a 400 toast
// instead of the control declining it. The bounds are clamped in onChange rather
// than left to the `max` attribute, which constrains the stepper but does not
// stop typing.
describe('CharacterEditorForm — bounded numeric inputs (VEG-500)', () => {
  const combatField = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
  // Name is `required`, so an empty form never reaches onSubmit — every
  // submit-path case below starts from a filled-in character.
  const renderFilled = () => renderForm({ initialValues: characterToFormValues(makeCharacter()) });

  it('publishes each bound as min/max, sourced from the shared constants', () => {
    renderForm();
    const ac = combatField('Armor Class');
    expect(ac.min).toBe('0');
    expect(ac.max).toBe(String(MAX_ARMOR_CLASS));

    const speed = combatField('Speed');
    expect(speed.min).toBe('0');
    expect(speed.max).toBe(String(MAX_SPEED));

    // Symmetric: VEG-452 made this column an additive bonus, and a negative
    // bonus is legitimate.
    const initiative = combatField('Initiative Bonus');
    expect(initiative.min).toBe(String(-MAX_INITIATIVE_BONUS));
    expect(initiative.max).toBe(String(MAX_INITIATIVE_BONUS));
  });

  it('pins an over-max speed to the bound instead of submitting the typed value', async () => {
    const { onSubmit } = renderFilled();
    const user = userEvent.setup();
    fireEvent.change(combatField('Speed'), { target: { value: '5000' } });
    expect(combatField('Speed').value).toBe(String(MAX_SPEED));
    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).speed).toBe(MAX_SPEED);
  });

  it('pins over-max keystrokes as they land, not just an atomic paste', async () => {
    renderForm();
    const user = userEvent.setup();
    const speed = combatField('Speed');
    await user.clear(speed);
    await user.type(speed, '5000');
    expect(speed.value).toBe(String(MAX_SPEED));
  });

  it('floors a fractional speed — the column is an int4', async () => {
    const { onSubmit } = renderFilled();
    const user = userEvent.setup();
    fireEvent.change(combatField('Speed'), { target: { value: '30.9' } });
    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).speed).toBe(30);
  });

  it('clamps armor class without disturbing the blank = derived sentinel', async () => {
    const { onSubmit } = renderFilled();
    const user = userEvent.setup();
    const ac = combatField('Armor Class');
    fireEvent.change(ac, { target: { value: '5000' } });
    expect(ac.value).toBe(String(MAX_ARMOR_CLASS));
    // Blanking must still mean "derive from equipped gear" (VEG-410), not 0.
    fireEvent.change(ac, { target: { value: '' } });
    expect(ac.value).toBe('');
    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).armorClass).toBe('');
  });

  it('clamps the initiative bonus at both ends of the symmetric bound', async () => {
    const { onSubmit } = renderFilled();
    const user = userEvent.setup();
    fireEvent.change(combatField('Initiative Bonus'), { target: { value: '-5000' } });
    expect(combatField('Initiative Bonus').value).toBe(String(-MAX_INITIATIVE_BONUS));
    fireEvent.change(combatField('Initiative Bonus'), { target: { value: '5000' } });
    expect(combatField('Initiative Bonus').value).toBe(String(MAX_INITIATIVE_BONUS));
    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).initiative).toBe(
      MAX_INITIATIVE_BONUS
    );
  });

  // The regression case. A lone "-" is not a valid number, so the browser reports
  // '' for it; coercing that to 0 made React rewrite the node to "0" and eat the
  // minus, so typing "-3" produced 3. Holding '' in state (as armorClass already
  // does) leaves the node alone and the browser keeps its "-" buffer.
  it('accepts a negative initiative bonus typed a keystroke at a time', async () => {
    const { onSubmit } = renderFilled();
    const user = userEvent.setup();
    const initiative = combatField('Initiative Bonus');
    await user.clear(initiative);
    await user.type(initiative, '-3');
    expect(initiative.value).toBe('-3');
    await user.click(screen.getByRole('button', { name: /create character/i }));
    expect((onSubmit.mock.calls[0][0] as CharacterFormValues).initiative).toBe(-3);
  });

  it('submits a blank initiative bonus as 0, not null', async () => {
    const { onSubmit } = renderFilled();
    const user = userEvent.setup();
    await user.clear(combatField('Initiative Bonus'));
    expect(combatField('Initiative Bonus').value).toBe('');
    await user.click(screen.getByRole('button', { name: /create character/i }));
    const values = onSubmit.mock.calls[0][0] as CharacterFormValues;
    expect(characterFormPayload(values).initiative).toBe(0);
  });
});
