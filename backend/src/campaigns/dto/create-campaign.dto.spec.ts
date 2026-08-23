import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_INT4 } from '@grimoire-os/shared';
import { CreateCampaignDto } from './create-campaign.dto';
import { UpdateCampaignDto } from './update-campaign.dto';

// Mirror the global ValidationPipe (bootstrap-config.ts): plainToInstance with
// enableImplicitConversion runs before validation in production.
function toDto(payload: object) {
  return plainToInstance(CreateCampaignDto, payload, { enableImplicitConversion: true });
}

function errorsFor(payload: object, property: string) {
  return validateSync(toDto({ name: 'Curse of Strahd', ...payload })).filter(
    e => e.property === property
  );
}

describe('CreateCampaignDto', () => {
  // VEG-496: currentSession is an Int column that carried a bare @IsNumber(),
  // so a fractional or out-of-int4 value reached Prisma and 500ed in the driver.
  describe('currentSession', () => {
    it('accepts a plausible session count', () => {
      expect(errorsFor({ currentSession: 12 }, 'currentSession')).toHaveLength(0);
    });

    it('accepts an absent value', () => {
      expect(errorsFor({}, 'currentSession')).toHaveLength(0);
    });

    it.each([0, MAX_INT4])('accepts the bound %p exactly', value => {
      expect(errorsFor({ currentSession: value }, 'currentSession')).toHaveLength(0);
    });

    it.each([-1, MAX_INT4 + 1])('rejects %p, outside the column range', value => {
      expect(errorsFor({ currentSession: value }, 'currentSession').length).toBeGreaterThan(0);
    });

    it('rejects a non-integer', () => {
      expect(errorsFor({ currentSession: 2.5 }, 'currentSession').length).toBeGreaterThan(0);
    });
  });

  // UpdateCampaignDto is a bare PartialType of this DTO, so the bound has to
  // come through inheritance rather than being restated.
  it('inherits the currentSession bound on PATCH', () => {
    const dto = plainToInstance(UpdateCampaignDto, { currentSession: 2.5 });
    expect(validateSync(dto).find(e => e.property === 'currentSession')).toBeDefined();
  });
});
