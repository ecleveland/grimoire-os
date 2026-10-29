import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CopyCharacterSnapshotDto } from './copy-character-snapshot.dto';
import { VALIDATOR_STRICTNESS } from '../../../bootstrap-config';

const CAMPAIGN_ID = 'a1b2c3d4-e5f6-4890-abcd-ef1234567890';

const toDto = (plain: Record<string, unknown>) => plainToInstance(CopyCharacterSnapshotDto, plain);

describe('CopyCharacterSnapshotDto', () => {
  it('accepts an empty body (VEG-646)', async () => {
    const dto = toDto({});

    expect(await validate(dto, VALIDATOR_STRICTNESS)).toHaveLength(0);
    expect(dto.name).toBeUndefined();
    expect(dto.campaignId).toBeUndefined();
  });

  it('trims the name and accepts a campaign id (VEG-646)', async () => {
    const dto = toDto({ name: '  Thorn the Second  ', campaignId: CAMPAIGN_ID });

    expect(await validate(dto, VALIDATOR_STRICTNESS)).toHaveLength(0);
    expect(dto.name).toBe('Thorn the Second');
    expect(dto.campaignId).toBe(CAMPAIGN_ID);
  });

  it('treats a blank name as no name (VEG-646)', async () => {
    const dto = toDto({ name: '   ' });

    expect(await validate(dto, VALIDATOR_STRICTNESS)).toHaveLength(0);
    expect(dto.name).toBeUndefined();
  });

  it('accepts a 100 character name (VEG-646)', async () => {
    expect(await validate(toDto({ name: 'a'.repeat(100) }), VALIDATOR_STRICTNESS)).toHaveLength(0);
  });

  it('rejects a 101 character name with the maxLength constraint (VEG-646)', async () => {
    const errors = await validate(toDto({ name: 'a'.repeat(101) }), VALIDATOR_STRICTNESS);

    expect(errors.find(e => e.property === 'name')?.constraints).toHaveProperty('maxLength');
  });

  it('rejects a non-string name with the isString constraint (VEG-646)', async () => {
    const errors = await validate(toDto({ name: 12 }), VALIDATOR_STRICTNESS);

    expect(errors.find(e => e.property === 'name')?.constraints).toHaveProperty('isString');
  });

  it('rejects a campaign id that is not a UUID (VEG-646)', async () => {
    const errors = await validate(toDto({ campaignId: 'not-a-uuid' }), VALIDATOR_STRICTNESS);

    expect(errors.find(e => e.property === 'campaignId')?.constraints).toHaveProperty('isUuid');
  });

  it('rejects an unknown key (VEG-646)', async () => {
    const errors = await validate(toDto({ level: 3 }), VALIDATOR_STRICTNESS);

    expect(errors.find(e => e.property === 'level')?.constraints).toHaveProperty(
      'whitelistValidation'
    );
  });
});
