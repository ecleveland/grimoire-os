import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCharacterSnapshotDto } from './create-character-snapshot.dto';
import { VALIDATOR_STRICTNESS } from '../../../bootstrap-config';

const toDto = (plain: Record<string, unknown>) =>
  plainToInstance(CreateCharacterSnapshotDto, plain);

describe('CreateCharacterSnapshotDto', () => {
  it('accepts a body with no label (VEG-644)', async () => {
    const dto = toDto({});

    expect(await validate(dto, VALIDATOR_STRICTNESS)).toHaveLength(0);
    expect(dto.label).toBeUndefined();
  });

  it('trims the label (VEG-644)', async () => {
    const dto = toDto({ label: '  Before the dragon  ' });

    expect(await validate(dto, VALIDATOR_STRICTNESS)).toHaveLength(0);
    expect(dto.label).toBe('Before the dragon');
  });

  it('treats a blank label as no label (VEG-644)', async () => {
    const dto = toDto({ label: '   ' });

    expect(await validate(dto, VALIDATOR_STRICTNESS)).toHaveLength(0);
    expect(dto.label).toBeUndefined();
  });

  it('accepts a 60 character label (VEG-644)', async () => {
    const dto = toDto({ label: 'a'.repeat(60) });

    expect(await validate(dto, VALIDATOR_STRICTNESS)).toHaveLength(0);
  });

  it('rejects a 61 character label with the maxLength constraint (VEG-644)', async () => {
    const errors = await validate(toDto({ label: 'a'.repeat(61) }), VALIDATOR_STRICTNESS);

    expect(errors.find(e => e.property === 'label')?.constraints).toHaveProperty('maxLength');
  });

  it('measures the length after trimming (VEG-644)', async () => {
    const dto = toDto({ label: `  ${'a'.repeat(60)}  ` });

    expect(await validate(dto, VALIDATOR_STRICTNESS)).toHaveLength(0);
  });

  it('rejects a non-string label with the isString constraint (VEG-644)', async () => {
    const errors = await validate(toDto({ label: 12 }), VALIDATOR_STRICTNESS);

    expect(errors.find(e => e.property === 'label')?.constraints).toHaveProperty('isString');
  });

  it('rejects an unknown key (VEG-644)', async () => {
    const errors = await validate(toDto({ foo: 1 }), VALIDATOR_STRICTNESS);

    expect(errors.find(e => e.property === 'foo')?.constraints).toHaveProperty(
      'whitelistValidation'
    );
  });
});
