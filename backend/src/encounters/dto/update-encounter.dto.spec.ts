import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_INT4 } from '@grimoire-os/shared';
import { UpdateEncounterDto } from './update-encounter.dto';

// Mirror the global ValidationPipe (bootstrap-config.ts): plainToInstance with
// enableImplicitConversion runs before validation in production.
function errorsFor(payload: object, property: string) {
  const dto = plainToInstance(UpdateEncounterDto, payload, { enableImplicitConversion: true });
  return validateSync(dto).filter(e => e.property === property);
}

describe('UpdateEncounterDto', () => {
  // VEG-496: currentTurn and round are Int columns that carried a bare
  // @IsNumber(), so a fractional or out-of-int4 value cleared validation,
  // reached Prisma and 500ed in the driver instead of 400ing here. Both are
  // bounded by the column rather than by any rule — a turn indexes into the
  // combatant list and a round just counts up.
  describe.each(['currentTurn', 'round'])('%s', property => {
    it('accepts a plausible value', () => {
      expect(errorsFor({ [property]: 3 }, property)).toHaveLength(0);
    });

    it('accepts an absent value', () => {
      expect(errorsFor({}, property)).toHaveLength(0);
    });

    it.each([0, MAX_INT4])('accepts the bound %p exactly', value => {
      expect(errorsFor({ [property]: value }, property)).toHaveLength(0);
    });

    it.each([-1, MAX_INT4 + 1])('rejects %p, outside the column range', value => {
      expect(errorsFor({ [property]: value }, property).length).toBeGreaterThan(0);
    });

    it('rejects a non-integer', () => {
      expect(errorsFor({ [property]: 2.5 }, property).length).toBeGreaterThan(0);
    });
  });

  // The optimistic-locking input is not a column, so the bound above must not
  // have been applied to it by accident (VEG-137 keeps it unbounded above zero).
  it('leaves expectedVersion accepting any non-negative integer', () => {
    expect(errorsFor({ expectedVersion: MAX_INT4 + 1 }, 'expectedVersion')).toHaveLength(0);
  });
});
