import * as fs from 'fs';
import * as path from 'path';

const JSON_DIR = path.resolve(__dirname, '../../../docs/extracted-srd-json');

function readJsonFile<T>(filename: string): T {
  const filePath = path.join(JSON_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`SRD JSON not found: ${filePath}. Ensure docs/extracted-srd-json/ exists.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

// ── JSON type definitions ──────────────────────────────

interface JsonSpell {
  name: string;
  level: number;
  school: string;
  classes: string[];
  casting_time: string;
  ritual: boolean;
  range: string;
  components: {
    verbal: boolean;
    somatic: boolean;
    material: boolean;
    material_description: string | null;
  };
  duration: string;
  concentration: boolean;
  description: string;
  higher_levels: string | null;
  cantrip_upgrade: string | null;
}

interface JsonMonster {
  name: string;
  size: string;
  type: string;
  alignment: string | null;
  armor_class: number;
  armor_description: string | null;
  hit_points: { average: number; formula: string };
  speed: Record<string, number | boolean | null>;
  ability_scores: Record<string, { score: number; modifier: number; save: number }>;
  skills: Record<string, string> | null;
  damage_resistances: string[] | null;
  damage_immunities: string[] | null;
  damage_vulnerabilities: string[] | null;
  condition_immunities: string[] | null;
  senses: string | null;
  languages: string | null;
  challenge_rating: string;
  xp: number;
  proficiency_bonus: number;
  traits: { name: string; description: string }[] | null;
  actions: { name: string; description: string }[] | null;
  reactions: { name: string; description: string }[] | null;
  legendary_actions: {
    description: string;
    actions: { name: string; description: string }[];
  } | null;
}

// ── SRD monster data validation guard ──────────────────
// Guards against the field-bleed corruption fixed in VEG-261 (a two-column PDF was
// extracted without respecting column boundaries, so monsters absorbed fragments of
// neighbouring stat blocks). Fails the seed loudly rather than silently persisting
// garbage. See scripts/extract-srd-monsters.mjs for how the data is re-derived.

const OFFICIAL_CONDITIONS = new Set([
  'blinded',
  'charmed',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
]);

const DAMAGE_TYPES = new Set([
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
]);

// A condition immunity may carry a trailing qualifier, e.g. "Charmed (with Mind Blank)".
function isValidConditionImmunity(entry: string): boolean {
  const base = entry
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLowerCase();
  return OFFICIAL_CONDITIONS.has(base);
}

// A damage entry is either a bare type ("Fire") or a descriptive clause that starts with
// one ("Piercing damage from weapons …"), plus the SRD's variable-damage placeholder.
function isValidDamageEntry(entry: string): boolean {
  if (/^Damage type chosen for the Draconic Origin/.test(entry)) return true;
  const firstToken = entry.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return DAMAGE_TYPES.has(firstToken);
}

// Legendary blocks name the acting creature ("…the aboleth can expend a use…"). Flag only
// when a foreign creature is positively identified; stay lenient if the phrase is absent.
function legendaryReferencesAnotherCreature(m: JsonMonster): boolean {
  const match = m.legendary_actions?.description
    .toLowerCase()
    .match(/the ([a-z][a-z' ]+?) can expend a use/);
  if (!match) return false;
  const ref = match[1].trim();
  const selfTokens = new Set([
    m.name.toLowerCase(),
    ...m.name
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean),
    (m.type ?? '').toLowerCase(),
  ]);
  return !selfTokens.has(ref) && !selfTokens.has(ref.split(/\s+/).pop() ?? ref);
}

export function validateMonsterData(monsters: JsonMonster[]): void {
  const errors: string[] = [];

  for (const m of monsters) {
    for (const ci of m.condition_immunities ?? []) {
      if (!isValidConditionImmunity(ci)) {
        errors.push(`${m.name}: invalid condition immunity "${ci}"`);
      }
    }

    for (const field of [
      'damage_resistances',
      'damage_immunities',
      'damage_vulnerabilities',
    ] as const) {
      for (const d of m[field] ?? []) {
        if (!isValidDamageEntry(d)) {
          errors.push(`${m.name}.${field}: invalid damage entry "${d}"`);
        }
      }
    }

    if (legendaryReferencesAnotherCreature(m)) {
      errors.push(
        `${m.name}: legendary_actions reference another creature: "${m.legendary_actions?.description}"`
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `SRD monster data validation failed (${errors.length} ${errors.length === 1 ? 'anomaly' : 'anomalies'}):\n  ` +
        errors.join('\n  ')
    );
  }
}

// ── Generic free-text validation guards (VEG-270) ──────────────────────────
// Reusable across the PDF-extracted SRD datasets (spells, magic items, species),
// mirroring validateMonsterData (VEG-261). Each predicate targets one corruption
// class produced by column-blind extraction of the SRD's two-column / embedded-
// table layout: a stat block or table that bled across the gutter leaves a
// foreign title, an orphaned word fragment, or a table collapsed into token soup.
// See scripts/lib/srd-pdf.mjs for the extraction side these guards backstop.

// 1. Trailing foreign-title bleed: the description ends with the title of a
//    different entry, absorbed across the column gap. The bled title is either
//    its own final line, or appended to the final line after sentence punctuation
//    (the latter only for multi-word titles, to avoid matching ordinary prose
//    that happens to end on a one-word spell name like "Light" or "Fly").
export function trailingForeignTitle(text: string, foreignTitles: Set<string>): string | null {
  const trimmed = text.replace(/\s+$/, '');
  const lastLine = trimmed.slice(trimmed.lastIndexOf('\n') + 1).trim();
  if (foreignTitles.has(lastLine)) return lastLine;

  for (const title of foreignTitles) {
    if (!title.includes(' ')) continue; // multi-word titles only on the same-line branch
    if (!trimmed.endsWith(title)) continue;
    const before = trimmed.charAt(trimmed.length - title.length - 1);
    if (before === '' || /[.!?”’")\s]/.test(before)) return title;
  }
  return null;
}

// 2. Dangling sub-word fragment tail: a mid-word column break left an orphaned
//    one- or two-letter lowercase fragment at the very end (the ticket's
//    "… / on a / n" example). "a" and "i" are real words and never flagged.
const FRAGMENT_STOPWORDS = new Set([
  'an',
  'as',
  'at',
  'be',
  'by',
  'do',
  'go',
  'he',
  'if',
  'in',
  'is',
  'it',
  'me',
  'my',
  'no',
  'of',
  'on',
  'or',
  'so',
  'to',
  'up',
  'us',
  'we',
]);
export function danglingFragmentTail(text: string): string | null {
  const last = text.replace(/\s+$/, '').split(/\s+/).pop() ?? '';
  if (last === 'a' || last === 'i' || last === 'I') return null;
  if (/^[a-z]$/.test(last)) return last;
  if (/^[a-z]{2}$/.test(last) && !FRAGMENT_STOPWORDS.has(last)) return last;
  return null;
}

// 3. Flattened embedded table: a two-column table collapsed into the description
//    as token soup. Any of three independent signals fires it — die-roll range
//    runs ("01–05 06–13 …"), pipe-delimited rows ("Stage | Condition"), or
//    wide-space column alignment ("1    Coyote    5    Black Bear"). Thresholds
//    require repetition so a lone legitimate die range or em-dash never trips it.
export function flattenedTableSignals(text: string): string[] {
  const signals: string[] = [];

  const ranges = text.match(/\b\d{1,3}\s*[–—-]\s*\d{2,3}\b/g) ?? [];
  if (ranges.length >= 3) signals.push(`die-range soup (${ranges.length} ranges)`);

  const pipeRows = text.match(/^[^\n|]*\S \| \S[^\n]*$/gm) ?? [];
  if (pipeRows.length >= 2) signals.push(`pipe-table rows (${pipeRows.length})`);

  const wideRows = text.match(/^\S.*?\S {4,}\S.*$/gm) ?? [];
  if (wideRows.length >= 2) signals.push(`wide-column rows (${wideRows.length})`);

  return signals;
}

// Aggregate the free-text predicates over a set of labelled entries. foreignTitles
// defaults to the entry labels themselves (the bleed case for flat datasets like
// spells); callers with a richer title space (species: species + trait names) pass
// their own set.
export interface FreeTextEntry {
  label: string;
  text: string;
}
export function findFreeTextAnomalies(
  entries: FreeTextEntry[],
  foreignTitles?: Set<string>
): string[] {
  const titles = foreignTitles ?? new Set(entries.map(e => e.label));
  const errors: string[] = [];

  for (const { label, text } of entries) {
    const foreign = new Set(titles);
    foreign.delete(label);

    const bled = trailingForeignTitle(text, foreign);
    if (bled) {
      errors.push(`${label}: description ends with another entry's title "${bled}"`);
    }

    const frag = danglingFragmentTail(text);
    if (frag) {
      errors.push(`${label}: dangling word fragment at end of description "…${frag}"`);
    }

    const flattened = flattenedTableSignals(text);
    if (flattened.length > 0) {
      errors.push(`${label}: flattened table in description — ${flattened.join('; ')}`);
    }
  }

  return errors;
}

function raiseIfAnomalies(dataset: string, errors: string[]): void {
  if (errors.length === 0) return;
  throw new Error(
    `SRD ${dataset} data validation failed (${errors.length} ${errors.length === 1 ? 'anomaly' : 'anomalies'}):\n  ` +
      errors.join('\n  ')
  );
}

export function validateSpellData(spells: JsonSpell[]): void {
  raiseIfAnomalies(
    'spell',
    findFreeTextAnomalies(spells.map(s => ({ label: s.name, text: s.description })))
  );
}

export function validateMagicItemData(items: JsonMagicItem[]): void {
  raiseIfAnomalies(
    'magic item',
    findFreeTextAnomalies(items.map(i => ({ label: i.name, text: i.description })))
  );
}

// Species traits reference an option table by name ("…from the Elven Lineages
// table") or an inline list ("…the following benefits:"). A referenced table is
// only well-formed when the matching structured `table`/`options` survived
// extraction; a column-blind extraction drops it, leaving a dangling reference.
const TABLE_REFERENCE = /\bthe ([A-Z][\w’'’ ]*?) tables?\b/;
const INLINE_LIST_REFERENCE = /the following (?:options|benefits)\b/i;

function tableIsWellFormed(table: JsonSpeciesTrait['table']): boolean {
  return (
    !!table &&
    Array.isArray(table.columns) &&
    table.columns.length > 0 &&
    Array.isArray(table.rows) &&
    table.rows.length > 0 &&
    table.rows.every(r => Array.isArray(r) && r.length === table.columns.length)
  );
}

function optionsArePresent(options: JsonSpeciesTrait['options']): boolean {
  return !!options && Array.isArray(options.choices) && options.choices.length > 0;
}

export function validateSpeciesData(species: JsonSpecies[]): void {
  const titles = new Set<string>();
  for (const s of species) {
    titles.add(s.name);
    for (const t of s.traits) titles.add(t.name);
  }

  const errors = findFreeTextAnomalies(
    species.flatMap(s =>
      s.traits.map(t => ({ label: `${s.name} / ${t.name}`, text: t.description }))
    ),
    titles
  );

  for (const s of species) {
    for (const t of s.traits) {
      const referencesTable =
        TABLE_REFERENCE.test(t.description) || INLINE_LIST_REFERENCE.test(t.description);
      if (referencesTable && !tableIsWellFormed(t.table) && !optionsArePresent(t.options)) {
        errors.push(
          `${s.name} / ${t.name}: references an option table that is missing or malformed ` +
            `(no well-formed table or options accompany the trait)`
        );
      }
    }
  }

  raiseIfAnomalies('species', errors);
}

interface JsonMagicItem {
  name: string;
  category: string;
  subcategory: string | null;
  rarity: string;
  requires_attunement: boolean;
  description: string;
}

interface JsonSpeciesTrait {
  name: string;
  description: string;
  // Lineage / ancestry traits carry a structured option table that the SRD prose
  // points at ("…from the Elven Lineages table"). Either may be present.
  options?: { choices: { name: string; description: string }[] } | null;
  table?: { name: string; columns: string[]; rows: string[][] } | null;
}

interface JsonSpecies {
  name: string;
  creature_type: string;
  size: string;
  size_description: string;
  speed: number;
  traits: JsonSpeciesTrait[];
}

// ── Loaders ────────────────────────────────────────────

export function loadSpellsFromJson() {
  const data = readJsonFile<{ spells: JsonSpell[] }>('spells.json');
  return data.spells.map(s => {
    const parts: string[] = [];
    if (s.components.verbal) parts.push('V');
    if (s.components.somatic) parts.push('S');
    if (s.components.material) parts.push('M');

    let description = s.description;
    if (s.cantrip_upgrade) {
      description += '\n\n' + s.cantrip_upgrade;
    }

    return {
      name: s.name,
      level: s.level,
      school: s.school,
      castingTime: s.casting_time,
      range: s.range,
      components: parts.join(', '),
      material: s.components.material_description ?? null,
      duration: s.duration,
      concentration: s.concentration,
      ritual: s.ritual,
      description,
      higherLevels: s.higher_levels ?? null,
      classes: s.classes,
    };
  });
}

const ABILITY_ABBREV: Record<string, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

const CR_FRACTIONS: Record<string, number> = {
  '1/8': 0.125,
  '1/4': 0.25,
  '1/2': 0.5,
};

function parseChallengeRating(cr: string): number {
  return CR_FRACTIONS[cr] ?? parseFloat(cr);
}

function formatSpeed(speed: Record<string, number | boolean | null>): string {
  const parts: string[] = [];
  const walk = speed.walk;
  if (typeof walk === 'number' && walk > 0) {
    parts.push(`${walk} ft.`);
  }
  for (const [key, val] of Object.entries(speed)) {
    if (key === 'walk' || key === 'hover') continue;
    if (typeof val === 'number' && val > 0) {
      parts.push(`${key} ${val} ft.`);
    }
  }
  if (speed.hover === true) {
    parts.push('hover');
  }
  return parts.join(', ');
}

export function loadMonstersFromJson() {
  const data = readJsonFile<{ monsters: JsonMonster[] }>('monsters.json');
  validateMonsterData(data.monsters);
  return data.monsters.map(m => {
    // Derive saving throw proficiencies
    const savingThrows: Record<string, number> = {};
    for (const [ability, scores] of Object.entries(m.ability_scores)) {
      if (scores.save !== scores.modifier) {
        savingThrows[ABILITY_ABBREV[ability]] = scores.save;
      }
    }

    // Parse skills
    let skills: Record<string, number> | null = null;
    if (m.skills) {
      skills = {};
      for (const [name, val] of Object.entries(m.skills)) {
        skills[name] = parseInt(val, 10);
      }
    }

    // Strip extra fields from trait-like arrays, keeping only name+description
    const strip = (arr: { name: string; description: string }[] | null) =>
      arr ? arr.map(({ name, description }) => ({ name, description })) : null;

    return {
      name: m.name,
      size: m.size,
      type: m.type,
      subtype: null as string | null,
      alignment: m.alignment ?? null,
      armorClass: m.armor_class,
      armorType: m.armor_description ?? null,
      hitPoints: m.hit_points.average,
      hitDice: m.hit_points.formula,
      speed: formatSpeed(m.speed),
      str: m.ability_scores.strength.score,
      dex: m.ability_scores.dexterity.score,
      con: m.ability_scores.constitution.score,
      int: m.ability_scores.intelligence.score,
      wis: m.ability_scores.wisdom.score,
      cha: m.ability_scores.charisma.score,
      savingThrows: Object.keys(savingThrows).length > 0 ? savingThrows : null,
      skills,
      damageResistances: m.damage_resistances ?? [],
      damageImmunities: m.damage_immunities ?? [],
      damageVulnerabilities: m.damage_vulnerabilities ?? [],
      conditionImmunities: m.condition_immunities ?? [],
      senses: m.senses ?? null,
      languages: m.languages ?? null,
      challengeRating: parseChallengeRating(m.challenge_rating),
      experiencePoints: m.xp,
      specialAbilities: strip(m.traits),
      actions: strip(m.actions),
      reactions: strip(m.reactions),
      legendaryActions: m.legendary_actions ? strip(m.legendary_actions.actions) : null,
      description: null as string | null,
    };
  });
}

export function loadMagicItemsFromJson() {
  const data = readJsonFile<{ magic_items: JsonMagicItem[] }>('magic_items.json');
  return data.magic_items.map(item => ({
    name: item.name,
    category: item.category,
    description: item.description,
    rarity: item.rarity,
    requiresAttunement: item.requires_attunement,
    isMagic: true,
    properties: item.subcategory ? [item.subcategory] : [],
  }));
}

export function loadSpeciesAsRacesFromJson() {
  const data = readJsonFile<{ species: JsonSpecies[] }>('species.json');
  return data.species.map(s => ({
    name: s.name,
    speed: s.speed,
    size: s.size,
    traits: s.traits.map(({ name, description }) => ({ name, description })),
    languages: ['Common'],
    sizeDescription: s.size_description,
  }));
}
