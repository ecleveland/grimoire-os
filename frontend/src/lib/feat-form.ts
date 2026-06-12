import type { SrdFeat } from '@/lib/types';
import { optionalText } from '@/lib/form-helpers';

/**
 * Form-state <-> API-payload mapping for the homebrew feat form (VEG-295).
 *
 * Everything the user types lives as strings so inputs stay fully controlled;
 * the benefits list is edited as one-benefit-per-line text and the repeatable
 * flag as a boolean. `formStateToPayload` validates and converts in one step,
 * returning either the request body or the first human-readable error.
 *
 * Cleared optional fields serialize as `null` (not `undefined`): JSON.stringify
 * drops undefined keys, which would make a PATCH silently keep the old value
 * (VEG-316).
 */

export interface FeatFormState {
  name: string;
  description: string;
  prerequisite: string;
  benefits: string;
  category: string;
  repeatable: boolean;
}

/** Request body for POST/PATCH /srd/feats (mirrors the backend CreateFeatDto). */
export interface FeatPayload {
  name: string;
  description: string;
  prerequisite: string | null;
  benefits: string[] | null;
  category: string | null;
  repeatable: boolean;
}

export type FeatFormResult = { payload: FeatPayload } | { error: string };

/** One benefit per line; lines are trimmed and blank lines dropped. */
export function parseBenefitLines(input: string): string[] {
  return input
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

export function emptyFeatFormState(): FeatFormState {
  return {
    name: '',
    description: '',
    prerequisite: '',
    benefits: '',
    category: '',
    repeatable: false,
  };
}

export function featToFormState(f: SrdFeat): FeatFormState {
  return {
    name: f.name,
    description: f.description ?? '',
    prerequisite: f.prerequisite ?? '',
    benefits: (f.benefits ?? []).join('\n'),
    category: f.category ?? '',
    repeatable: f.repeatable ?? false,
  };
}

export function formStateToPayload(s: FeatFormState): FeatFormResult {
  const name = s.name.trim();
  if (!name) return { error: 'Name is required' };

  const description = s.description.trim();
  if (!description) return { error: 'Description is required' };

  const benefits = parseBenefitLines(s.benefits);

  return {
    payload: {
      name,
      description,
      prerequisite: optionalText(s.prerequisite),
      benefits: benefits.length ? benefits : null,
      category: optionalText(s.category),
      repeatable: s.repeatable,
    },
  };
}
