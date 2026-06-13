import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { LOOT_CR_BUCKETS } from '@grimoire-os/shared';

const VALID_BUCKETS = new Set<string>(LOOT_CR_BUCKETS);

// A per-CR-bucket chance map: { '0': 0.001, '2–4': 0.02, ... }. Every key must
// be one of the canonical loot CR buckets (the en-dash labels the loot engine
// selects on — an ASCII hyphen never matches), and every value a probability
// in [0, 1]. An empty map is rejected: the resolver treats {} as absent and
// silently falls back to the defaults, so saving one would be a no-op the
// admin can't see. NaN/negative/over-1 chances would corrupt drop rates.
export function isCrChanceMap(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return false;
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
