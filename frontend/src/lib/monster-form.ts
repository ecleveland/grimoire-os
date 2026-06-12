import type { MonsterAction, SrdMonster } from '@/lib/types';
import { formatBonuses } from '@/lib/srd-format';

/**
 * Form-state <-> API-payload mapping for the homebrew monster form (VEG-293).
 *
 * Everything the user types lives as strings (numbers included) so inputs stay
 * fully controlled; bonus maps and string lists are edited as comma-separated
 * text. `formStateToPayload` validates and converts in one step, returning
 * either the request body or the first human-readable error.
 *
 * Cleared optional fields serialize as `null` (not `undefined`): JSON.stringify
 * drops undefined keys, which would make a PATCH silently keep the old value
 * (VEG-316).
 */

export interface MonsterFormState {
  name: string;
  size: string;
  type: string;
  subtype: string;
  alignment: string;
  armorClass: string;
  armorType: string;
  hitPoints: string;
  hitDice: string;
  speed: string;
  str: string;
  dex: string;
  con: string;
  int: string;
  wis: string;
  cha: string;
  savingThrows: string;
  skills: string;
  damageResistances: string;
  damageImmunities: string;
  damageVulnerabilities: string;
  conditionImmunities: string;
  senses: string;
  languages: string;
  challengeRating: string;
  experiencePoints: string;
  specialAbilities: MonsterAction[];
  actions: MonsterAction[];
  reactions: MonsterAction[];
  legendaryActions: MonsterAction[];
  description: string;
}

/** Request body for POST/PATCH /srd/monsters (mirrors the backend CreateMonsterDto). */
export interface MonsterPayload {
  name: string;
  size: string;
  type: string;
  subtype: string | null;
  alignment: string | null;
  armorClass: number;
  armorType: string | null;
  hitPoints: number;
  hitDice: string | null;
  speed: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  savingThrows: Record<string, number> | null;
  skills: Record<string, number> | null;
  damageResistances: string[];
  damageImmunities: string[];
  damageVulnerabilities: string[];
  conditionImmunities: string[];
  senses: string | null;
  languages: string | null;
  challengeRating: number;
  experiencePoints: number | null;
  specialAbilities: MonsterAction[];
  actions: MonsterAction[];
  reactions: MonsterAction[];
  legendaryActions: MonsterAction[];
  description: string | null;
}

export type MonsterFormResult = { payload: MonsterPayload } | { error: string };

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

function formatBonusList(map: Record<string, number> | null | undefined): string {
  return map ? formatBonuses(map) : '';
}

/** "cold, fire" -> ['cold', 'fire']; blank entries dropped. */
export function parseCommaList(input: string): string[] {
  return input
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** "str +7, con 9" -> { str: 7, con: 9 }; null when any entry lacks a numeric bonus. */
export function parseBonusList(input: string): Record<string, number> | null {
  const result: Record<string, number> = {};
  for (const entry of parseCommaList(input)) {
    const match = /^(.+?)\s+([+-]?\d+)$/.exec(entry);
    if (!match) return null;
    result[match[1].trim()] = Number(match[2]);
  }
  return result;
}

/** "5", "0.125", or "1/4" -> number; null when unparseable. */
export function parseCr(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(trimmed);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return Number(fraction[1]) / denominator;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function emptyMonsterFormState(): MonsterFormState {
  return {
    name: '',
    size: '',
    type: '',
    subtype: '',
    alignment: '',
    armorClass: '',
    armorType: '',
    hitPoints: '',
    hitDice: '',
    speed: '',
    str: '10',
    dex: '10',
    con: '10',
    int: '10',
    wis: '10',
    cha: '10',
    savingThrows: '',
    skills: '',
    damageResistances: '',
    damageImmunities: '',
    damageVulnerabilities: '',
    conditionImmunities: '',
    senses: '',
    languages: '',
    challengeRating: '',
    experiencePoints: '',
    specialAbilities: [],
    actions: [],
    reactions: [],
    legendaryActions: [],
    description: '',
  };
}

export function monsterToFormState(m: SrdMonster): MonsterFormState {
  return {
    name: m.name,
    size: m.size,
    type: m.type,
    subtype: m.subtype ?? '',
    alignment: m.alignment ?? '',
    armorClass: String(m.armorClass),
    armorType: m.armorType ?? '',
    hitPoints: String(m.hitPoints),
    hitDice: m.hitDice ?? '',
    speed: m.speed,
    str: String(m.str),
    dex: String(m.dex),
    con: String(m.con),
    int: String(m.int),
    wis: String(m.wis),
    cha: String(m.cha),
    savingThrows: formatBonusList(m.savingThrows),
    skills: formatBonusList(m.skills),
    damageResistances: m.damageResistances.join(', '),
    damageImmunities: m.damageImmunities.join(', '),
    damageVulnerabilities: m.damageVulnerabilities.join(', '),
    conditionImmunities: m.conditionImmunities.join(', '),
    senses: m.senses ?? '',
    languages: m.languages ?? '',
    challengeRating: String(m.challengeRating),
    experiencePoints: m.experiencePoints != null ? String(m.experiencePoints) : '',
    specialAbilities: m.specialAbilities ?? [],
    actions: m.actions ?? [],
    reactions: m.reactions ?? [],
    legendaryActions: m.legendaryActions ?? [],
    description: m.description ?? '',
  };
}

function parseIntInRange(input: string, min: number, max: number): number | null {
  const value = Number(input.trim());
  if (!Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

function optionalText(input: string): string | null {
  return input.trim() || null;
}

function validateActions(label: string, actions: MonsterAction[]): string | null {
  for (const action of actions) {
    if (!action.name.trim() || !action.description.trim()) {
      return `Every ${label} entry needs both a name and a description`;
    }
  }
  return null;
}

export function formStateToPayload(s: MonsterFormState): MonsterFormResult {
  const name = s.name.trim();
  if (!name) return { error: 'Name is required' };
  const size = s.size.trim();
  if (!size) return { error: 'Size is required' };
  const type = s.type.trim();
  if (!type) return { error: 'Type is required' };
  const speed = s.speed.trim();
  if (!speed) return { error: 'Speed is required' };

  const armorClass = parseIntInRange(s.armorClass, 0, 40);
  if (armorClass === null) return { error: 'Armor Class must be a number between 0 and 40' };
  const hitPoints = parseIntInRange(s.hitPoints, 1, 5000);
  if (hitPoints === null) return { error: 'Hit Points must be a number of at least 1' };

  const abilities = {} as Record<(typeof ABILITY_KEYS)[number], number>;
  for (const key of ABILITY_KEYS) {
    const score = parseIntInRange(s[key], 1, 30);
    if (score === null) return { error: `${key.toUpperCase()} must be a number between 1 and 30` };
    abilities[key] = score;
  }

  const challengeRating = parseCr(s.challengeRating);
  if (challengeRating === null || challengeRating < 0 || challengeRating > 30) {
    return { error: 'Challenge Rating must be a number (or fraction like 1/4) between 0 and 30' };
  }

  let experiencePoints: number | null = null;
  if (s.experiencePoints.trim()) {
    experiencePoints = parseIntInRange(s.experiencePoints, 0, 1_000_000);
    if (experiencePoints === null) return { error: 'XP must be a non-negative whole number' };
  }

  const savingThrows = parseBonusList(s.savingThrows);
  if (savingThrows === null) {
    return { error: 'Saving Throws must look like "str +7, con +9"' };
  }
  const skills = parseBonusList(s.skills);
  if (skills === null) {
    return { error: 'Skills must look like "perception +2, stealth +4"' };
  }

  for (const [label, actions] of [
    ['trait', s.specialAbilities],
    ['action', s.actions],
    ['reaction', s.reactions],
    ['legendary action', s.legendaryActions],
  ] as const) {
    const actionError = validateActions(label, actions);
    if (actionError) return { error: actionError };
  }

  const trimActions = (actions: MonsterAction[]): MonsterAction[] =>
    actions.map(a => ({ name: a.name.trim(), description: a.description.trim() }));

  return {
    payload: {
      name,
      size,
      type,
      subtype: optionalText(s.subtype),
      alignment: optionalText(s.alignment),
      armorClass,
      armorType: optionalText(s.armorType),
      hitPoints,
      hitDice: optionalText(s.hitDice),
      speed,
      ...abilities,
      savingThrows: Object.keys(savingThrows).length > 0 ? savingThrows : null,
      skills: Object.keys(skills).length > 0 ? skills : null,
      damageResistances: parseCommaList(s.damageResistances),
      damageImmunities: parseCommaList(s.damageImmunities),
      damageVulnerabilities: parseCommaList(s.damageVulnerabilities),
      conditionImmunities: parseCommaList(s.conditionImmunities),
      senses: optionalText(s.senses),
      languages: optionalText(s.languages),
      challengeRating,
      experiencePoints,
      specialAbilities: trimActions(s.specialAbilities),
      actions: trimActions(s.actions),
      reactions: trimActions(s.reactions),
      legendaryActions: trimActions(s.legendaryActions),
      description: optionalText(s.description),
    },
  };
}
