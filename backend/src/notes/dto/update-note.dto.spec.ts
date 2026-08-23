import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_INT4 } from '@grimoire-os/shared';
import { UpdateNoteDto } from './update-note.dto';

// Mirror the global ValidationPipe (bootstrap-config.ts): plainToInstance with
// enableImplicitConversion runs before validation in production.
function toDto(payload: object) {
  return plainToInstance(UpdateNoteDto, payload, { enableImplicitConversion: true });
}

function validate(payload: object) {
  return validateSync(toDto(payload));
}

describe('UpdateNoteDto', () => {
  it('accepts an explicit null sessionNumber (clear the field)', () => {
    expect(validate({ sessionNumber: null })).toHaveLength(0);
  });

  it('preserves null through transform instead of coercing it to a number', () => {
    expect(toDto({ sessionNumber: null }).sessionNumber).toBeNull();
  });

  it('accepts a numeric sessionNumber and an omitted one', () => {
    expect(validate({ sessionNumber: 4 })).toHaveLength(0);
    expect(validate({})).toHaveLength(0);
  });

  it('still coerces numeric strings the way the implicit-conversion pipe always has', () => {
    const dto = toDto({ sessionNumber: '7' });
    expect(dto.sessionNumber).toBe(7);
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects a non-numeric sessionNumber', () => {
    expect(validate({ sessionNumber: 'not-a-number' }).length).toBeGreaterThan(0);
  });

  // VEG-496: the field carried a bare @IsNumber(), so a fractional or
  // out-of-int4 value cleared validation and 500ed in the Prisma driver. The
  // null-clear cases above are the reason @IsOptional() stays — it skips null
  // as well as undefined, so the bound never rejects a deliberate clear.
  it('accepts session zero and the upper bound exactly', () => {
    expect(validate({ sessionNumber: 0 })).toHaveLength(0);
    expect(validate({ sessionNumber: MAX_INT4 })).toHaveLength(0);
  });

  it.each([-1, MAX_INT4 + 1])('rejects %p, outside the column range', value => {
    expect(validate({ sessionNumber: value }).length).toBeGreaterThan(0);
  });

  it('rejects a non-integer sessionNumber', () => {
    expect(validate({ sessionNumber: 1.5 }).length).toBeGreaterThan(0);
  });
});
