import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { LOOT_CR_BUCKETS } from '@grimoire-os/shared';

const VALID_BUCKETS = new Set<string>(LOOT_CR_BUCKETS);

// A per-CR-bucket chance map: { '0': 0.001, '0–1': 0.005, '2–4': 0.02, ... }.
// The map must be COMPLETE — every canonical CR bucket present, no extras — and
// every value a probability in [0, 1]. Completeness is required because the
// resolver stores the map wholesale and never merges per-bucket defaults: a
// partial map would silently resolve the omitted buckets to a 0% drop rate
// (loot-roller.ts), disabling magic items for those CRs with no error. Keys
// use the en-dash labels the loot engine selects on (an ASCII hyphen never
// matches); NaN/negative/over-1 chances would corrupt drop rates. Disabling a
// bucket is expressed with an explicit 0, not by omitting it.
export function isCrChanceMap(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  // Exactly the full bucket set: length match + every key valid rules out both
  // missing buckets and unknown extras (object keys are unique).
  if (entries.length !== VALID_BUCKETS.size) return false;
  return entries.every(
    ([key, v]) =>
      VALID_BUCKETS.has(key) && typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1
  );
}

@ValidatorConstraint({ name: 'isCrChanceMap', async: false })
class IsCrChanceMapConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isCrChanceMap(value);
  }

  defaultMessage(): string {
    return (
      '$property must map CR buckets (' +
      LOOT_CR_BUCKETS.join(', ') +
      ') to probabilities between 0 and 1'
    );
  }
}

export function IsCrChanceMap(options?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options,
      validator: IsCrChanceMapConstraint,
    });
  };
}
