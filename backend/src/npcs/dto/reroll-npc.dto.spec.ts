import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RerollNpcDto } from './reroll-npc.dto';

// Mirror the global ValidationPipe (bootstrap-config.ts): plainToInstance with
// enableImplicitConversion runs before validation in production.
function toDto(payload: object) {
  return plainToInstance(RerollNpcDto, payload, { enableImplicitConversion: true });
}

function validate(payload: object) {
  return validateSync(toDto(payload));
}

describe('RerollNpcDto', () => {
  it('accepts a bare field reroll', () => {
    expect(validate({ field: 'loot' })).toHaveLength(0);
    expect(validate({ field: 'name' })).toHaveLength(0);
  });

  it('rejects an unknown field', () => {
    expect(validate({ field: 'hairColor' }).length).toBeGreaterThan(0);
  });

  it('accepts valid lootOverrides', () => {
    expect(
      validate({
        field: 'loot',
        lootOverrides: {
          coinageMultiplier: 2,
          trinketChance: 0.15,
          magicItemChance: 0.1,
          itemCountDie: '1d4',
        },
      })
    ).toHaveLength(0);
  });

  it('accepts an explicit null lootOverrides (clear saved overrides)', () => {
    expect(validate({ field: 'loot', lootOverrides: null })).toHaveLength(0);
    expect(toDto({ field: 'loot', lootOverrides: null }).lootOverrides).toBeNull();
  });

  it('rejects negative override values (mirrors the VEG-300 guards)', () => {
    expect(
      validate({ field: 'loot', lootOverrides: { coinageMultiplier: -1 } }).length
    ).toBeGreaterThan(0);
    expect(
      validate({ field: 'loot', lootOverrides: { trinketChance: -0.5 } }).length
    ).toBeGreaterThan(0);
    expect(
      validate({ field: 'loot', lootOverrides: { magicItemChance: -0.1 } }).length
    ).toBeGreaterThan(0);
  });

  it('rejects unknown override knobs under the whitelist pipe', () => {
    const errors = validateSync(toDto({ field: 'loot', lootOverrides: { goldRain: true } }), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
