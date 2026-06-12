import type { SrdItem } from '@/lib/types';
import { optionalText, parseCommaList } from '@/lib/form-helpers';

/**
 * Form-state <-> API-payload mapping for the homebrew item form (VEG-296).
 *
 * Everything the user types lives as strings (numbers included) so inputs stay
 * fully controlled; the properties list is edited as comma-separated text and
 * the attunement/magic/stealth flags as booleans. `formStateToPayload`
 * validates and converts in one step, returning either the request body or the
 * first human-readable error.
 *
 * Cleared optional fields serialize as `null` (not `undefined`): JSON.stringify
 * drops undefined keys, which would make a PATCH silently keep the old value
 * (VEG-316).
 */

export interface ItemFormState {
  name: string;
  category: string;
  rarity: string;
  cost: string;
  weight: string;
  damage: string;
  damageType: string;
  armorClass: string;
  strengthRequirement: string;
  properties: string;
  description: string;
  requiresAttunement: boolean;
  isMagic: boolean;
  stealthDisadvantage: boolean;
}

/** Request body for POST/PATCH /srd/items (mirrors the backend CreateItemDto). */
export interface ItemPayload {
  name: string;
  category: string;
  rarity: string | null;
  cost: string | null;
  weight: number | null;
  damage: string | null;
  damageType: string | null;
  armorClass: string | null;
  strengthRequirement: number | null;
  properties: string[] | null;
  description: string | null;
  requiresAttunement: boolean;
  isMagic: boolean;
  stealthDisadvantage: boolean;
}

export type ItemFormResult = { payload: ItemPayload } | { error: string };

export function emptyItemFormState(): ItemFormState {
  return {
    name: '',
    category: '',
    rarity: '',
    cost: '',
    weight: '',
    damage: '',
    damageType: '',
    armorClass: '',
    strengthRequirement: '',
    properties: '',
    description: '',
    requiresAttunement: false,
    isMagic: false,
    stealthDisadvantage: false,
  };
}

export function itemToFormState(i: SrdItem): ItemFormState {
  return {
    name: i.name,
    category: i.category,
    rarity: i.rarity ?? '',
    cost: i.cost ?? '',
    weight: i.weight != null ? String(i.weight) : '',
    damage: i.damage ?? '',
    damageType: i.damageType ?? '',
    armorClass: i.armorClass ?? '',
    strengthRequirement: i.strengthRequirement != null ? String(i.strengthRequirement) : '',
    properties: (i.properties ?? []).join(', '),
    description: i.description ?? '',
    requiresAttunement: i.requiresAttunement ?? false,
    isMagic: i.isMagic ?? false,
    stealthDisadvantage: i.stealthDisadvantage ?? false,
  };
}

export function formStateToPayload(s: ItemFormState): ItemFormResult {
  const name = s.name.trim();
  if (!name) return { error: 'Name is required' };

  const category = s.category.trim();
  if (!category) return { error: 'Category is required' };

  let weight: number | null = null;
  if (s.weight.trim()) {
    weight = Number(s.weight);
    if (!Number.isFinite(weight) || weight < 0) {
      return { error: 'Weight must be a non-negative number' };
    }
  }

  let strengthRequirement: number | null = null;
  if (s.strengthRequirement.trim()) {
    strengthRequirement = Number(s.strengthRequirement);
    if (!Number.isInteger(strengthRequirement) || strengthRequirement < 0) {
      return { error: 'Strength requirement must be a non-negative whole number' };
    }
  }

  const properties = parseCommaList(s.properties);

  return {
    payload: {
      name,
      category,
      rarity: optionalText(s.rarity),
      cost: optionalText(s.cost),
      weight,
      damage: optionalText(s.damage),
      damageType: optionalText(s.damageType),
      armorClass: optionalText(s.armorClass),
      strengthRequirement,
      properties: properties.length ? properties : null,
      description: optionalText(s.description),
      requiresAttunement: s.requiresAttunement,
      isMagic: s.isMagic,
      stealthDisadvantage: s.stealthDisadvantage,
    },
  };
}
