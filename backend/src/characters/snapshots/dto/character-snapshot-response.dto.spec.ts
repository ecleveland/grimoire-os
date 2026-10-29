import 'reflect-metadata';
import { toDto } from '../../../common/serialization/to-dto';
import { CharacterDto } from '../../dto/character-response.dto';
import {
  CharacterSnapshotDto,
  CharacterSnapshotSummaryDto,
} from './character-snapshot-response.dto';

const TAKEN_AT = new Date('2026-10-01T12:00:00Z');
const summary = { id: 'snap-1', level: 4, label: 'Level 4', takenAt: TAKEN_AT };

describe('character snapshot response DTOs (VEG-643)', () => {
  it('keeps the summary fields and drops an extraneous one (VEG-643)', () => {
    const dto = toDto(CharacterSnapshotSummaryDto, { ...summary, characterId: 'c-1', data: {} });

    expect(dto).toBeInstanceOf(CharacterSnapshotSummaryDto);
    expect({ ...dto }).toEqual(summary);
  });

  it('keeps the summary fields and the character data, and drops an extraneous one (VEG-643)', () => {
    const data = toDto(CharacterDto, { id: 'c-1', name: 'Thorn', level: 4 });

    const dto = toDto(CharacterSnapshotDto, { ...summary, data, characterId: 'c-1' });

    expect(dto).toBeInstanceOf(CharacterSnapshotDto);
    expect(dto).not.toHaveProperty('characterId');
    expect(dto).toMatchObject(summary);
    expect(dto.data).toBeInstanceOf(CharacterDto);
    expect(dto.data).toMatchObject({ id: 'c-1', name: 'Thorn', level: 4 });
  });

  it('drops an extraneous field inside the character data (VEG-643)', () => {
    const data = toDto(CharacterDto, { id: 'c-1', name: 'Thorn' });

    const dto = toDto(CharacterSnapshotDto, {
      ...summary,
      data: { ...data, passwordHash: 'leaked' },
    });

    expect(dto.data).not.toHaveProperty('passwordHash');
    expect(dto.data.name).toBe('Thorn');
  });
});
