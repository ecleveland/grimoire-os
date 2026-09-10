'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import type {
  AbilityScores,
  Character,
  CharacterFeat,
  Currency,
  DieType,
  Feature,
  HitDice,
  HitPoints,
  InventoryItem,
  Size,
  SpellEntry,
  SrdBackground,
  SrdClass,
  SrdLanguage,
  SrdRace,
  SrdSubclass,
  Weapon,
} from '@/lib/types';
import { asHitDie, HIT_DIE_TYPES, SIZES } from '@/lib/types';
import { MAX_ARMOR_CLASS, MAX_INITIATIVE_BONUS, MAX_SPEED } from '@grimoire-os/shared';
import { clampIntToRange } from '@/lib/form-helpers';
import { ABILITY_NAMES, ARMOR_TYPES, SKILL_NAMES } from '@/lib/dnd-constants';
import { recommendedAbilityKeys } from '@/lib/ability-math';
import { DEFAULT_ABILITY_SCORES, DEFAULT_SPEED, EMPTY_CURRENCY } from '@/lib/character-defaults';

/** Editable HP baseline for a new or legacy/null-HP character (10/10/0). */
const DEFAULT_EDITOR_HIT_POINTS: HitPoints = { max: 10, current: 10, temporary: 0 };
import { useApiQuery } from '@/lib/query';
import {
  RecommendedAbilitiesSummary,
  RecommendedAbilityTag,
} from '@/components/RecommendedAbilities';
import FormField from '@/components/FormField';
import SrdCombobox from '@/components/SrdCombobox';
import { backgroundOptions, resolveBackground } from '@/lib/background-selection';
import { classOptions, resolveClass } from '@/lib/class-selection';
import ToggleChips from '@/components/ToggleChips';
import TokenListEditor from '@/components/TokenListEditor';
import WeaponsEditor from '@/components/WeaponsEditor';
import FeaturesEditor from '@/components/FeaturesEditor';

// Editable shape of a character. Slice 1 covered identity/abilities/combat;
// slice 2 (VEG-348) adds the SRD-grant fields below so picking a class/race/
// background can autofill them. Spell/inventory/personality editors come later;
// the page wrappers add `campaignId` (create) and `expectedVersion` (edit) on
// top of the payload below.
export interface CharacterFormValues {
  name: string;
  race: string;
  class: string;
  /**
   * Resolution key for the selected SRD/homebrew class (VEG-524). Same contract
   * as `backgroundId` below: VEG-506 let homebrew classes reuse an SRD name, so
   * the class's hit die and per-level features must resolve by id, not name.
   * `''` when free-typed (no catalog row). Persisted to `Character.classId`.
   */
  classId: string;
  subclass: string;
  level: number;
  background: string;
  /**
   * Resolution key for the selected SRD/homebrew background (VEG-473). Homebrew
   * backgrounds may share an SRD name, so grants must resolve by id, not name.
   * `''` when free-typed (no catalog row). Persisted to `Character.backgroundId`
   * (VEG-476) so a loaded character re-resolves by id instead of a name that may
   * now collide with a homebrew row; `background` stays the display string.
   */
  backgroundId: string;
  alignment: string;
  size: Size;
  abilityScores: AbilityScores;
  /** Blank = no manual override — AC derives from equipped gear (VEG-410). */
  armorClass: number | '';
  /**
   * Blank is a transient editing state, not a distinct value: it submits as 0
   * (VEG-500). The field has to be able to hold `''` because a lone `-` is not
   * a valid number, so the browser reports `''` for it mid-keystroke — coercing
   * that to 0 made React rewrite the node and eat the minus sign, leaving the
   * symmetric bound VEG-452 put on this column unreachable from the UI.
   */
  initiative: number | '';
  speed: number;
  hitPoints: HitPoints;
  /**
   * Null means "no die recorded", the same thing it means on the wire (VEG-530).
   * This used to be non-nullable, filled with a d8 on load and sent on every
   * save, so saving any unrelated field on a character that had no hit dice
   * persisted a pool nobody chose — and that stored die then outranked the
   * VEG-528 level-up picker, so the one surface that asks which die a character
   * uses never appeared again. Same reasoning as `armorClass: ''` below.
   */
  hitDice: HitDice | null;
  // Proficiencies & training — editable via ProficienciesSection (slice 3) and
  // also written by the SRD autofill helpers (slice 2).
  savingThrows: string[];
  skills: string[];
  proficiencies: string[];
  languages: string[];
  armorTraining: string[];
  spellcastingAbility: string;
  // Personality & details (slice 4) — free text; the selected SRD background can
  // suggest traits/ideals/bonds/flaws.
  appearance: string;
  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  backstory: string;
  avatarUrl: string;
  // Weapons table + features/traits/feats (slice 5). Features are categorized on
  // the sheet by `source` (class → Class Features, race → Species Traits, any
  // other source → Feats); granted feats also come from the structured `feats`
  // field below (VEG-430).
  weapons: Weapon[];
  features: Feature[];
  // Granted feats (VEG-430), e.g. a background's origin feat. Carried structured
  // ({ featId, name, option }) rather than folded into `features` so the chosen
  // parameter (Magic Initiate's spell list) survives round-trips.
  feats: CharacterFeat[];
  // Starting inventory + coin. Currently written only by the guided builder's
  // Equipment step (VEG-382); the classic editor round-trips them untouched (no
  // inventory editor yet), so loading and re-sending them is a no-op there.
  inventory: InventoryItem[];
  currency: Currency;
  // Structured spell list (VEG-347). Written by the guided builder's Spells step
  // (VEG-383); the classic editor round-trips them untouched (no spell editor in
  // this form yet), so loading and re-sending them is a no-op there.
  spells: SpellEntry[];
}

/** Zeroed coin purse — the SRD default for a fresh character. */
export function emptyCurrency(): Currency {
  return { ...EMPTY_CURRENCY };
}

const abilityKeys: (keyof AbilityScores)[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
];
const abilityLabels: Record<keyof AbilityScores, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

/** Blank form for the create flow — SRD-default ability scores, no hit die yet. */
export function emptyCharacterFormValues(): CharacterFormValues {
  return {
    name: '',
    race: '',
    class: '',
    classId: '',
    subclass: '',
    level: 1,
    background: '',
    backgroundId: '',
    alignment: '',
    size: 'Medium',
    abilityScores: { ...DEFAULT_ABILITY_SCORES },
    // Blank, not 10: a new character starts on derived AC (VEG-410); a stored
    // 10 would be a manual override that pins the sheet even after equipping armor.
    armorClass: '',
    initiative: 0,
    speed: DEFAULT_SPEED,
    hitPoints: { ...DEFAULT_EDITOR_HIT_POINTS },
    // No die until something knows which one (VEG-530): picking a class folds
    // its die in, the server seeds from the resolved class on create, and the
    // editor's own picker records one directly. A blank d8 here was a guess
    // that survived to become a permanent pool.
    hitDice: null,
    savingThrows: [],
    skills: [],
    proficiencies: [],
    languages: [],
    armorTraining: [],
    spellcastingAbility: '',
    appearance: '',
    personalityTraits: '',
    ideals: '',
    bonds: '',
    flaws: '',
    backstory: '',
    avatarUrl: '',
    weapons: [],
    features: [],
    feats: [],
    inventory: [],
    currency: emptyCurrency(),
    spells: [],
  };
}

/** Map a loaded character onto the editable form shape, filling slice-1 gaps. */
export function characterToFormValues(c: Character): CharacterFormValues {
  return {
    name: c.name,
    race: c.race ?? '',
    class: c.class ?? '',
    subclass: c.subclass ?? '',
    level: c.level,
    // Seed the persisted id (VEG-524) so the class resolves by id on load, even
    // when its display name now collides with a homebrew class. Blank for
    // characters saved before the column existed, or free-typed names — those
    // fall back to the unambiguous-name resolver.
    classId: c.classId ?? '',
    background: c.background ?? '',
    // Seed the persisted id (VEG-476) so the background resolves by id on load,
    // even when its display name now collides with a homebrew row (VEG-473).
    // Blank for legacy characters saved before the column existed, or free-typed
    // names — those fall back to the unambiguous-name resolver.
    backgroundId: c.backgroundId ?? '',
    alignment: c.alignment ?? '',
    // Server-side `size` is free-text; coerce to the canonical union, falling
    // back to Medium for absent/legacy values outside the set.
    size: (SIZES as readonly string[]).includes(c.size ?? '') ? (c.size as Size) : 'Medium',
    // These columns are nullable at the API boundary (VEG-425); a legacy/minimal
    // character edits from the same neutral defaults as a brand-new one.
    abilityScores: c.abilityScores ?? { ...DEFAULT_ABILITY_SCORES },
    // Null stays blank: it means "derived from equipment" (VEG-410), and
    // seeding a number here would silently re-materialize a manual override.
    armorClass: c.armorClass ?? '',
    initiative: c.initiative ?? 0,
    speed: c.speed ?? DEFAULT_SPEED,
    hitPoints: c.hitPoints ?? { ...DEFAULT_EDITOR_HIT_POINTS },
    // Straight through, null and all — see the field's comment on
    // CharacterFormValues. `?? null` only collapses the optional key's
    // `undefined` (a payload from a backend predating the column) onto the same
    // "not recorded" the column's own null means.
    hitDice: c.hitDice ?? null,
    savingThrows: c.savingThrows ?? [],
    skills: c.skills ?? [],
    proficiencies: c.proficiencies ?? [],
    languages: c.languages ?? [],
    armorTraining: c.armorTraining ?? [],
    spellcastingAbility: c.spellcastingAbility ?? '',
    appearance: c.appearance ?? '',
    personalityTraits: c.personalityTraits ?? '',
    ideals: c.ideals ?? '',
    bonds: c.bonds ?? '',
    flaws: c.flaws ?? '',
    backstory: c.backstory ?? '',
    avatarUrl: c.avatarUrl ?? '',
    weapons: c.weapons ?? [],
    features: c.features ?? [],
    feats: c.feats ?? [],
    inventory: c.inventory ?? [],
    currency: c.currency ?? emptyCurrency(),
    spells: c.spells ?? [],
  };
}

// The set of Character fields this editor writes. Annotating the payload with
// this Pick means dropping/renaming a field here (or forgetting to send a newly
// added grant field) is a compile error, not a silent failed-to-persist bug.
type CharacterWriteFields = Pick<
  Character,
  | 'name'
  | 'race'
  | 'class'
  | 'classId'
  | 'subclass'
  | 'level'
  | 'background'
  | 'backgroundId'
  | 'alignment'
  | 'size'
  | 'abilityScores'
  | 'armorClass'
  | 'initiative'
  | 'speed'
  | 'hitPoints'
  | 'hitDice'
  | 'savingThrows'
  | 'skills'
  | 'proficiencies'
  | 'languages'
  | 'armorTraining'
  | 'spellcastingAbility'
  | 'appearance'
  | 'personalityTraits'
  | 'ideals'
  | 'bonds'
  | 'flaws'
  | 'backstory'
  | 'avatarUrl'
  | 'weapons'
  | 'features'
  | 'feats'
  | 'inventory'
  | 'currency'
  | 'spells'
>;

/**
 * The API request body for create/update, derived from the form values. The
 * page wrappers spread this and append `campaignId` / `expectedVersion`. The
 * backend `CreateCharacterDto`/`UpdateCharacterDto` accept every key here.
 */
export function characterFormPayload(v: CharacterFormValues): CharacterWriteFields {
  return {
    name: v.name,
    race: v.race,
    class: v.class,
    // `class` is the display string; `classId` (VEG-524) is the resolution key.
    // A free-typed class has no catalog row, so send null rather than an empty
    // string to keep the column a clean soft ref.
    classId: v.classId === '' ? null : v.classId,
    subclass: v.subclass,
    level: v.level,
    // `background` is the display string; `backgroundId` (VEG-476) is the
    // resolution key. A free-typed background has no catalog row, so send null
    // rather than an empty string to keep the column a clean soft ref.
    background: v.background,
    backgroundId: v.backgroundId === '' ? null : v.backgroundId,
    alignment: v.alignment,
    size: v.size,
    abilityScores: v.abilityScores,
    armorClass: v.armorClass === '' ? null : v.armorClass,
    // Unlike armorClass, blank here is not "derive it" — the column is a flat
    // bonus and no bonus is 0 (VEG-500).
    initiative: v.initiative === '' ? 0 : v.initiative,
    speed: v.speed,
    hitPoints: v.hitPoints,
    // `undefined`, which JSON.stringify drops, so an unrecorded pool sends no
    // `hitDice` key at all rather than an explicit null (VEG-530). On update
    // that leaves the column alone; on create it is what lets the server seed
    // the pool from the resolved class, which matters because this editor only
    // folds in class grants when the player clicks "Apply <Class> traits".
    hitDice: v.hitDice ?? undefined,
    savingThrows: v.savingThrows,
    skills: v.skills,
    proficiencies: v.proficiencies,
    languages: v.languages,
    armorTraining: v.armorTraining,
    spellcastingAbility: v.spellcastingAbility,
    appearance: v.appearance,
    personalityTraits: v.personalityTraits,
    ideals: v.ideals,
    bonds: v.bonds,
    flaws: v.flaws,
    backstory: v.backstory,
    avatarUrl: v.avatarUrl,
    // Drop incomplete rows the user added but never named.
    weapons: v.weapons.filter(w => w.name.trim() !== ''),
    features: v.features.filter(f => f.name.trim() !== ''),
    feats: v.feats.filter(f => f.name.trim() !== ''),
    inventory: v.inventory.filter(i => i.name.trim() !== ''),
    currency: v.currency,
    spells: v.spells.filter(s => s.name.trim() !== ''),
  };
}

// ── SRD autofill (slice 2) ──────────────────────────────────────────────────
// Pure union-merge helpers: picking a class/race/background offers to fold its
// granted traits into the character without clobbering existing values. Each
// returns the next form values plus a summary of what was newly added (for the
// confirmation toast). Class *skills* are a choose-N pool, not a flat grant, so
// they're intentionally left to the slice-3 proficiencies editor.

export interface GrantSummary {
  label: string;
  values: string[];
}

/** Append only the additions not already present; report which were new. */
function union(current: string[], additions: string[]): { merged: string[]; added: string[] } {
  const have = new Set(current);
  const added = additions.filter(a => !have.has(a));
  return { merged: added.length ? [...current, ...added] : current, added };
}

/**
 * SRD class `armorProficiencies` are phrases ('Light armor', 'All armor',
 * 'Shields (…)') while the editor's armor-training toggles use the canonical
 * ARMOR_TYPES. Map phrases onto those so autofilled armor lights up the toggles
 * (and the sheet's armor dots). Unrecognized phrasing is kept verbatim.
 */
export function normalizeArmorProficiencies(raw: string[]): string[] {
  const out: string[] = [];
  for (const item of raw) {
    const lc = item.toLowerCase();
    if (lc.includes('all armor')) out.push('Light', 'Medium', 'Heavy');
    else if (lc.includes('light')) out.push('Light');
    else if (lc.includes('medium')) out.push('Medium');
    else if (lc.includes('heavy')) out.push('Heavy');
    else if (lc.includes('shield')) out.push('Shields');
    else out.push(item);
  }
  return [...new Set(out)];
}

export function applyClassGrants(
  v: CharacterFormValues,
  c: SrdClass
): { values: CharacterFormValues; added: GrantSummary[] } {
  const added: GrantSummary[] = [];
  const saves = union(v.savingThrows, c.savingThrows);
  const armor = union(v.armorTraining, normalizeArmorProficiencies(c.armorProficiencies));
  const profs = union(v.proficiencies, [...c.weaponProficiencies, ...c.toolProficiencies]);
  if (saves.added.length) added.push({ label: 'Saving throws', values: saves.added });
  if (armor.added.length) added.push({ label: 'Armor training', values: armor.added });
  if (profs.added.length) added.push({ label: 'Proficiencies', values: profs.added });

  // The class's die wins; a die the sheet cannot use leaves whatever was already
  // there, including nothing. Folding a class in is one of the two ways a pool
  // gets recorded here (VEG-530) — the player choosing a die is the other — and
  // it sizes the pool to the level, the same rule the server seed and the
  // backfill migration follow.
  const dieType = asHitDie(c.hitDie) ?? v.hitDice?.dieType ?? null;
  const hitDice = dieType ? { total: v.level, spent: 0, ...v.hitDice, dieType } : v.hitDice;
  if (dieType && dieType !== v.hitDice?.dieType) {
    added.push({ label: 'Hit die', values: [dieType] });
  }

  const spellcastingAbility = c.spellcasting?.ability ?? v.spellcastingAbility;
  if (spellcastingAbility !== v.spellcastingAbility) {
    added.push({ label: 'Spellcasting ability', values: [spellcastingAbility] });
  }

  return {
    values: {
      ...v,
      savingThrows: saves.merged,
      armorTraining: armor.merged,
      proficiencies: profs.merged,
      hitDice,
      spellcastingAbility,
    },
    added,
  };
}

export function applyRaceGrants(
  v: CharacterFormValues,
  r: SrdRace
): { values: CharacterFormValues; added: GrantSummary[] } {
  const added: GrantSummary[] = [];
  const langs = union(v.languages, r.languages);
  if (langs.added.length) added.push({ label: 'Languages', values: langs.added });
  const size = (SIZES as readonly string[]).includes(r.size) ? (r.size as Size) : v.size;
  if (size !== v.size) added.push({ label: 'Size', values: [size] });
  return { values: { ...v, languages: langs.merged, size }, added };
}

export function applyBackgroundGrants(
  v: CharacterFormValues,
  b: SrdBackground
): { values: CharacterFormValues; added: GrantSummary[] } {
  const added: GrantSummary[] = [];
  const skills = union(v.skills, b.skillProficiencies);
  const profs = union(v.proficiencies, b.toolProficiencies);
  if (skills.added.length) added.push({ label: 'Skills', values: skills.added });
  if (profs.added.length) added.push({ label: 'Proficiencies', values: profs.added });
  // Background `languages` is a count (how many to choose), not named langs, so
  // there's nothing to copy into Character.languages here.
  return { values: { ...v, skills: skills.merged, proficiencies: profs.merged }, added };
}

/** Human-readable summary for the autofill toast. */
export function summarizeGrants(source: string, added: GrantSummary[]): string {
  if (!added.length) return `${source}'s granted traits are already applied.`;
  const parts = added.map(g => `${g.label}: ${g.values.join(', ')}`);
  return `Applied from ${source} — ${parts.join('; ')}`;
}

const cardClass =
  'bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4';
const sectionHeading = 'text-lg font-semibold text-gray-900 dark:text-white';

interface CharacterEditorFormProps {
  initialValues: CharacterFormValues;
  submitLabel: string;
  submitting: boolean;
  onSubmit: (values: CharacterFormValues) => void | Promise<void>;
  onCancel: () => void;
  /** Extra control rendered at the bottom of the Identity section (campaign picker). */
  identityExtra?: ReactNode;
  /** Extra control rendered opposite the submit/cancel buttons (delete). */
  footerExtra?: ReactNode;
}

interface ProficienciesSectionProps {
  values: CharacterFormValues;
  set: <K extends keyof CharacterFormValues>(key: K, value: CharacterFormValues[K]) => void;
  /** The selected class's skill-choice pool, highlighted on the skill toggles. */
  classSkillPool: string[];
  numSkillChoices: number;
  languageSuggestions: string[];
}

/**
 * Editable proficiencies & training (VEG-348 slice 3). Saves/skills/armor are
 * toggle groups over the canonical 5e sets; the class skill pool is highlighted
 * with an advisory "X of N chosen" counter (never enforced — manual override).
 * Languages and weapon/tool proficiencies are open-ended token lists. The
 * autofill buttons above write into these same fields.
 */
function ProficienciesSection({
  values,
  set,
  classSkillPool,
  numSkillChoices,
  languageSuggestions,
}: ProficienciesSectionProps) {
  const poolChosen = values.skills.filter(s => classSkillPool.includes(s)).length;
  const skillsHelper =
    classSkillPool.length > 0 && numSkillChoices > 0
      ? `From your class (choose ${numSkillChoices}): ${poolChosen} of ${numSkillChoices} chosen`
      : undefined;

  return (
    <div className={cardClass}>
      <h2 className={sectionHeading}>Proficiencies &amp; Training</h2>
      <ToggleChips
        label="Saving Throws"
        options={ABILITY_NAMES}
        value={values.savingThrows}
        onChange={v => set('savingThrows', v)}
      />
      <ToggleChips
        label="Skills"
        options={SKILL_NAMES}
        value={values.skills}
        onChange={v => set('skills', v)}
        highlight={classSkillPool}
        helperText={skillsHelper}
      />
      <ToggleChips
        label="Armor Training"
        options={ARMOR_TYPES}
        value={values.armorTraining}
        onChange={v => set('armorTraining', v)}
      />
      <TokenListEditor
        label="Languages"
        value={values.languages}
        onChange={v => set('languages', v)}
        suggestions={languageSuggestions}
        placeholder="Add a language…"
      />
      <TokenListEditor
        label="Weapon & Tool Proficiencies"
        value={values.proficiencies}
        onChange={v => set('proficiencies', v)}
        placeholder="Add a proficiency…"
      />
      <FormField
        as="select"
        label="Spellcasting Ability"
        value={values.spellcastingAbility}
        onChange={e => set('spellcastingAbility', e.target.value)}
      >
        <option value="">None</option>
        {ABILITY_NAMES.map(a => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </FormField>
    </div>
  );
}

type SuggestKey = 'personalityTraits' | 'ideals' | 'bonds' | 'flaws';
const PERSONALITY_FIELDS: { key: SuggestKey; label: string }[] = [
  { key: 'personalityTraits', label: 'Personality Traits' },
  { key: 'ideals', label: 'Ideals' },
  { key: 'bonds', label: 'Bonds' },
  { key: 'flaws', label: 'Flaws' },
];

interface PersonalityDetailsSectionProps {
  values: CharacterFormValues;
  set: <K extends keyof CharacterFormValues>(key: K, value: CharacterFormValues[K]) => void;
  /** When the chosen background is an SRD one, its suggestion arrays. */
  background?: SrdBackground;
}

/**
 * Personality & details (slice 4): appearance, the four personality fields,
 * backstory, and an avatar URL. When an SRD background is selected, each
 * personality field offers its suggestions as chips that append (non-destructive)
 * to the free-text the user can still edit.
 */
function PersonalityDetailsSection({ values, set, background }: PersonalityDetailsSectionProps) {
  const append = (key: SuggestKey, text: string) => {
    const current = values[key];
    set(key, current.trim() ? `${current.trimEnd()}\n${text}` : text);
  };

  const suggestionsFor = (key: SuggestKey): string[] => (background ? (background[key] ?? []) : []);

  return (
    <div className={cardClass}>
      <h2 className={sectionHeading}>Personality &amp; Details</h2>
      <FormField
        as="textarea"
        rows={2}
        label="Appearance"
        value={values.appearance}
        onChange={e => set('appearance', e.target.value)}
      />
      {PERSONALITY_FIELDS.map(({ key, label }) => {
        const suggestions = suggestionsFor(key);
        return (
          <div key={key}>
            <FormField
              as="textarea"
              rows={2}
              label={label}
              value={values[key]}
              onChange={e => set(key, e.target.value)}
            />
            {suggestions.length > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Suggestions from {background?.name}:
                </span>
                {suggestions.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => append(key, s)}
                    className="px-2 py-0.5 text-xs rounded-full border border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/20"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <FormField
        as="textarea"
        rows={4}
        label="Backstory"
        value={values.backstory}
        onChange={e => set('backstory', e.target.value)}
      />
      <FormField
        type="url"
        label="Avatar URL"
        value={values.avatarUrl}
        onChange={e => set('avatarUrl', e.target.value)}
        helperText="Link to a portrait image, shown on the character sheet."
      />
    </div>
  );
}

export default function CharacterEditorForm({
  initialValues,
  submitLabel,
  submitting,
  onSubmit,
  onCancel,
  identityExtra,
  footerExtra,
}: CharacterEditorFormProps) {
  const [values, setValues] = useState<CharacterFormValues>(initialValues);

  // SRD catalogs for the pickers. These endpoints return small full arrays, so
  // we fetch once and filter client-side. A failed load degrades gracefully —
  // the comboboxes simply offer no suggestions and free-text entry still works.
  const classes = useApiQuery<SrdClass[]>('/srd/classes').data ?? [];
  const races = useApiQuery<SrdRace[]>('/srd/races').data ?? [];
  const backgrounds = useApiQuery<SrdBackground[]>('/srd/backgrounds').data ?? [];
  // Memoized so typing in the background combobox doesn't rebuild the
  // collision-count map on every keystroke.
  const bgOptions = useMemo(() => backgroundOptions(backgrounds), [backgrounds]);
  // Memoized for the same reason as bgOptions: re-typing in the combobox must
  // not rebuild the collision-count map on every keystroke.
  const classOpts = useMemo(() => classOptions(classes), [classes]);
  const languageSuggestions = (useApiQuery<SrdLanguage[]>('/srd/languages').data ?? []).map(
    l => l.name
  );

  // Resolve the current free-text values back to SRD entities (by name) so we
  // can scope subclasses and offer the autofill action — works whether the user
  // just picked from the list or loaded an existing character.
  // id-first so a duplicate-named homebrew class resolves unambiguously once
  // picked; falls back to name for a loaded character that has no id (VEG-524).
  const selectedClass = resolveClass(classes, { id: values.classId, name: values.class });
  const selectedRace = races.find(r => r.name === values.race);
  // id-first so a duplicate-named homebrew background resolves unambiguously once
  // picked; falls back to name for a loaded character that has no id (VEG-473).
  const selectedBackground = resolveBackground(backgrounds, {
    id: values.backgroundId,
    name: values.background,
  });

  // Recommended primary abilities for the selected class (VEG-447) — purely
  // informational; resolves to none for a free-typed/homebrew class.
  const recommendedAbilities = recommendedAbilityKeys(selectedClass?.primaryAbilities);

  const subclasses =
    useApiQuery<SrdSubclass[]>(`/srd/subclasses?classId=${selectedClass?.id ?? ''}`, {
      enabled: !!selectedClass,
    }).data ?? [];

  const set = <K extends keyof CharacterFormValues>(key: K, value: CharacterFormValues[K]) =>
    setValues(prev => ({ ...prev, [key]: value }));

  // Hit dice only, not the full `DIE_TYPES` (VEG-530). This control records a
  // pool, and every other write path — the server seed, the backfill migration,
  // the class-grant helpers — refuses a d20 or d100; leaving them selectable here
  // let one pick persist a die `LevelUpDialog` then reads back unnarrowed, worth
  // +51 a level in a permanent HP maximum. A die already on the sheet is appended
  // so a legacy pool stays visible and editable rather than silently re-rendering
  // as a different die.
  const storedDie = values.hitDice?.dieType;
  const hitDieOptions: readonly string[] =
    storedDie && !(HIT_DIE_TYPES as readonly string[]).includes(storedDie)
      ? [...HIT_DIE_TYPES, storedDie]
      : HIT_DIE_TYPES;

  const applyGrants = (
    source: string,
    apply: (v: CharacterFormValues) => { values: CharacterFormValues; added: GrantSummary[] }
  ) => {
    const { values: next, added } = apply(values);
    setValues(next);
    toast.success(summarizeGrants(source, added));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Callers own the user-facing success/error toasts; this is a backstop so a
    // handler that rejects without its own catch can't fail silently (which
    // would leave the submit button stuck on "Saving…").
    Promise.resolve(onSubmit(values)).catch(err => {
      console.error('CharacterEditorForm onSubmit failed:', err);
      toast.error('Something went wrong saving the character.');
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Identity ───────────────────────────────────────────── */}
      <div className={cardClass}>
        <h2 className={sectionHeading}>Identity</h2>
        <FormField
          label="Name"
          type="text"
          required
          value={values.name}
          onChange={e => set('name', e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <SrdCombobox
            label="Race"
            value={values.race}
            options={races}
            onChange={v => set('race', v)}
            helperText="Pick from the SRD or type a custom species."
          />
          <SrdCombobox
            label="Class"
            value={values.class}
            options={classOpts}
            // Typing clears the id so a stale one can't linger and silently
            // resolve to the wrong duplicate-named class (VEG-524).
            onChange={v => setValues(prev => ({ ...prev, class: v, classId: '' }))}
            // Picking captures the id, and invalidates any chosen subclass
            // (subclasses are scoped to the class) to avoid a mismatched pair.
            onSelect={opt => setValues(prev => ({ ...prev, classId: opt.id, subclass: '' }))}
            helperText="Pick from the SRD or type a custom class."
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <SrdCombobox
            label="Subclass"
            value={values.subclass}
            options={subclasses}
            onChange={v => set('subclass', v)}
            helperText={selectedClass ? undefined : 'Select an SRD class to list its subclasses.'}
          />
          <FormField
            label="Level"
            type="number"
            min={1}
            max={20}
            value={values.level}
            onChange={e => set('level', Number(e.target.value))}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <SrdCombobox
            label="Background"
            value={values.background}
            options={bgOptions}
            // Picking captures the id (unambiguous even for a duplicate name);
            // any typed edit clears it so a stale id can't linger (VEG-473).
            onChange={v => setValues(prev => ({ ...prev, background: v, backgroundId: '' }))}
            onSelect={opt => set('backgroundId', opt.id)}
            helperText="Pick from the SRD or type a custom background."
          />
          <FormField
            label="Alignment"
            type="text"
            value={values.alignment}
            onChange={e => set('alignment', e.target.value)}
          />
          <FormField
            as="select"
            label="Size"
            value={values.size}
            onChange={e => set('size', e.target.value as Size)}
          >
            {SIZES.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </FormField>
        </div>

        {/* Offer to fold each matched SRD entity's granted traits into the
            character (union-merge — never clobbers manual edits). */}
        {(selectedClass || selectedRace || selectedBackground) && (
          <div className="flex flex-wrap gap-2">
            {selectedClass && (
              <button
                type="button"
                onClick={() =>
                  applyGrants(selectedClass.name, v => applyClassGrants(v, selectedClass))
                }
                className="px-3 py-1.5 text-sm rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/20 transition-colors"
              >
                Apply {selectedClass.name} traits
              </button>
            )}
            {selectedRace && (
              <button
                type="button"
                onClick={() =>
                  applyGrants(selectedRace.name, v => applyRaceGrants(v, selectedRace))
                }
                className="px-3 py-1.5 text-sm rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/20 transition-colors"
              >
                Apply {selectedRace.name} traits
              </button>
            )}
            {selectedBackground && (
              <button
                type="button"
                onClick={() =>
                  applyGrants(selectedBackground.name, v =>
                    applyBackgroundGrants(v, selectedBackground)
                  )
                }
                className="px-3 py-1.5 text-sm rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-900/20 transition-colors"
              >
                Apply {selectedBackground.name} traits
              </button>
            )}
          </div>
        )}
        {identityExtra}
      </div>

      {/* ── Proficiencies & Training ───────────────────────────── */}
      <ProficienciesSection
        values={values}
        set={set}
        classSkillPool={selectedClass?.skillChoices ?? []}
        numSkillChoices={selectedClass?.numSkillChoices ?? 0}
        languageSuggestions={languageSuggestions}
      />

      {/* ── Ability Scores ─────────────────────────────────────── */}
      <div className={cardClass}>
        <h2 className={sectionHeading}>Ability Scores</h2>
        <RecommendedAbilitiesSummary
          characterClass={values.class}
          recommended={recommendedAbilities}
        />
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mt-3">
          {abilityKeys.map(key => (
            <div key={key} className="text-center">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                {abilityLabels[key]}
                {recommendedAbilities.includes(key) && <RecommendedAbilityTag />}
              </label>
              <input
                type="number"
                min={1}
                max={30}
                aria-label={abilityLabels[key]}
                value={values.abilityScores[key]}
                onChange={e =>
                  set('abilityScores', {
                    ...values.abilityScores,
                    [key]: Number(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-center"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Combat ─────────────────────────────────────────────── */}
      <div className={cardClass}>
        <h2 className={sectionHeading}>Combat</h2>
        <div className="grid grid-cols-3 gap-4">
          {/*
            The three bounds below are clamped in onChange, not left to the
            `max` attribute (VEG-500). `max` constrains the stepper and native
            validation but does not stop typing, so on its own it would turn the
            server's 400 into a silent client-side invalid state. Clamping only
            bites past the bound, so ordinary typing is untouched.
          */}
          <FormField
            label="Armor Class"
            type="number"
            min={0}
            max={MAX_ARMOR_CLASS}
            placeholder="derived"
            value={values.armorClass}
            onChange={e =>
              set(
                'armorClass',
                e.target.value === '' ? '' : clampIntToRange(e.target.value, 0, MAX_ARMOR_CLASS)
              )
            }
          />
          <FormField
            label="Initiative Bonus"
            type="number"
            min={-MAX_INITIATIVE_BONUS}
            max={MAX_INITIATIVE_BONUS}
            helperText="Added to your Dexterity modifier (Alert, Jack of All Trades…)"
            value={values.initiative}
            onChange={e =>
              set(
                'initiative',
                e.target.value === ''
                  ? ''
                  : clampIntToRange(e.target.value, -MAX_INITIATIVE_BONUS, MAX_INITIATIVE_BONUS)
              )
            }
          />
          <FormField
            label="Speed"
            type="number"
            min={0}
            max={MAX_SPEED}
            value={values.speed}
            onChange={e => set('speed', clampIntToRange(e.target.value, 0, MAX_SPEED))}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FormField
            label="Max HP"
            type="number"
            min={0}
            value={values.hitPoints.max}
            onChange={e => set('hitPoints', { ...values.hitPoints, max: Number(e.target.value) })}
          />
          <FormField
            label="Current HP"
            type="number"
            value={values.hitPoints.current}
            onChange={e =>
              set('hitPoints', { ...values.hitPoints, current: Number(e.target.value) })
            }
          />
          <FormField
            label="Temp HP"
            type="number"
            min={0}
            value={values.hitPoints.temporary}
            onChange={e =>
              set('hitPoints', { ...values.hitPoints, temporary: Number(e.target.value) })
            }
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FormField
            as="select"
            label="Hit Die"
            value={values.hitDice?.dieType ?? ''}
            onChange={e =>
              set('hitDice', {
                // A level-N character owns N unspent dice — the same pool the
                // server seeds and the backfill writes. Recording a die on a
                // sheet that had none is the point of this control (VEG-530).
                // Floored at 1 because the Level field coerces a cleared input to
                // 0 (`Number('')`) and `min={1}` is only an HTML hint, so sizing
                // straight off it could record an empty pool.
                total: Math.max(1, values.level),
                spent: 0,
                ...values.hitDice,
                dieType: e.target.value as DieType,
              })
            }
          >
            {/* Disabled, so it can show an unrecorded pool but not be chosen back
                into one. The payload omits `hitDice` when it is null, so picking
                this would silently fail to persist — and un-recording was never
                possible here anyway. */}
            {!values.hitDice && (
              <option value="" disabled>
                Not recorded
              </option>
            )}
            {hitDieOptions.map(d => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </FormField>
          <FormField
            label="Hit Dice Total"
            type="number"
            min={0}
            // Blank and inert until a die is recorded: a total without a die is
            // not a pool, and showing 0 would read as "no dice left".
            value={values.hitDice?.total ?? ''}
            disabled={!values.hitDice}
            onChange={e =>
              values.hitDice && set('hitDice', { ...values.hitDice, total: Number(e.target.value) })
            }
          />
          <FormField
            label="Hit Dice Spent"
            type="number"
            min={0}
            value={values.hitDice?.spent ?? ''}
            disabled={!values.hitDice}
            onChange={e =>
              values.hitDice && set('hitDice', { ...values.hitDice, spent: Number(e.target.value) })
            }
          />
        </div>
      </div>

      {/* ── Weapons & Features ─────────────────────────────────── */}
      <div className={cardClass}>
        <h2 className={sectionHeading}>Weapons &amp; Features</h2>
        <WeaponsEditor value={values.weapons} onChange={w => set('weapons', w)} />
        <FeaturesEditor
          value={values.features}
          onChange={f => set('features', f)}
          sourceSuggestions={[values.class, values.race]}
        />
      </div>

      {/* ── Personality & Details ──────────────────────────────── */}
      <PersonalityDetailsSection values={values} set={set} background={selectedBackground} />

      {/* ── Actions ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Saving...' : submitLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
        {footerExtra}
      </div>
    </form>
  );
}
