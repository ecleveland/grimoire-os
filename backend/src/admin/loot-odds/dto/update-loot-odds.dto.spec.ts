import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { VALIDATOR_STRICTNESS } from '../../../bootstrap-config';
import { UpdateLootOddsDto } from './update-loot-odds.dto';

// Mirror the global ValidationPipe (bootstrap-config.ts): implicit conversion
// before validation, whitelist + forbidNonWhitelisted strictness.
function toDto(payload: object) {
  return plainToInstance(UpdateLootOddsDto, payload, { enableImplicitConversion: true });
}

function validate(payload: object) {
  return validateSync(toDto(payload), VALIDATOR_STRICTNESS);
}

const VALID_MAP = { '0': 0.001, '0–1': 0.005, '2–4': 0.02, '5–10': 0.05, '11+': 0.15 };

describe('UpdateLootOddsDto', () => {
  it('accepts a full, well-formed payload', () => {
    expect(
      validate({
        trinketChance: 0.05,
        magicItemChanceByCr: VALID_MAP,
        itemCountDie: '1d3',
        coinageMultiplier: 1,
      })
    ).toHaveLength(0);
  });

  it('accepts a partial payload (single knob)', () => {
    expect(validate({ coinageMultiplier: 2 })).toHaveLength(0);
    expect(validate({ itemCountDie: '2d6' })).toHaveLength(0);
  });

  it('accepts an empty payload', () => {
    expect(validate({})).toHaveLength(0);
  });

  it('rejects an unknown knob under the whitelist pipe', () => {
    expect(validate({ goldRain: true }).length).toBeGreaterThan(0);
  });

  describe('trinketChance', () => {
    it('rejects negatives and values above 1', () => {
      expect(validate({ trinketChance: -0.1 }).length).toBeGreaterThan(0);
      expect(validate({ trinketChance: 1.5 }).length).toBeGreaterThan(0);
    });

    it('accepts the boundary values 0 and 1', () => {
      expect(validate({ trinketChance: 0 })).toHaveLength(0);
      expect(validate({ trinketChance: 1 })).toHaveLength(0);
    });
  });

  describe('coinageMultiplier', () => {
    it('rejects negatives but allows values above 1', () => {
      expect(validate({ coinageMultiplier: -1 }).length).toBeGreaterThan(0);
      expect(validate({ coinageMultiplier: 3 })).toHaveLength(0);
    });
  });

  describe('itemCountDie', () => {
    it('rejects malformed die specs', () => {
      for (const bad of ['', 'd', '3', '1x3', '0d6', '1d0', 'abc']) {
        expect(validate({ itemCountDie: bad }).length).toBeGreaterThan(0);
      }
    });

    it('accepts well-formed die specs (with or without a count)', () => {
      for (const good of ['1d3', '2d6', 'd20', '10d4']) {
        expect(validate({ itemCountDie: good })).toHaveLength(0);
      }
    });
  });

  describe('magicItemChanceByCr', () => {
    it('rejects an empty map', () => {
      expect(validate({ magicItemChanceByCr: {} }).length).toBeGreaterThan(0);
    });

    it('rejects unknown CR-bucket keys (e.g. an ASCII hyphen)', () => {
      expect(validate({ magicItemChanceByCr: { '0-1': 0.005 } }).length).toBeGreaterThan(0);
      expect(validate({ magicItemChanceByCr: { '99+': 0.1 } }).length).toBeGreaterThan(0);
    });

    it('rejects out-of-range or non-numeric chances', () => {
      expect(validate({ magicItemChanceByCr: { '0': -0.1 } }).length).toBeGreaterThan(0);
      expect(validate({ magicItemChanceByCr: { '0': 1.5 } }).length).toBeGreaterThan(0);
      expect(
        validate({ magicItemChanceByCr: { '0': 'lots' as unknown as number } }).length
      ).toBeGreaterThan(0);
    });

    it('accepts a partial map of valid buckets', () => {
      expect(validate({ magicItemChanceByCr: { '0': 0, '11+': 1 } })).toHaveLength(0);
    });
  });
});
