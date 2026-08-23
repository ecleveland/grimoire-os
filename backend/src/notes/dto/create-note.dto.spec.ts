import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_INT4 } from '@grimoire-os/shared';
import { CreateNoteDto } from './create-note.dto';

// Mirror the global ValidationPipe (bootstrap-config.ts): plainToInstance with
// enableImplicitConversion runs before validation in production.
function errorsFor(payload: object, property: string) {
  const dto = plainToInstance(
    CreateNoteDto,
    { campaignId: 'campaign-1', title: 'Session 1', content: 'notes', ...payload },
    { enableImplicitConversion: true }
  );
  return validateSync(dto).filter(e => e.property === property);
}

describe('CreateNoteDto', () => {
  // VEG-496: sessionNumber is an Int column that carried a bare @IsNumber().
  describe('sessionNumber', () => {
    it('accepts a plausible session number', () => {
      expect(errorsFor({ sessionNumber: 4 }, 'sessionNumber')).toHaveLength(0);
    });

    it('accepts an absent value (the column is optional)', () => {
      expect(errorsFor({}, 'sessionNumber')).toHaveLength(0);
    });

    it('accepts session zero, which is a real session people take notes on', () => {
      expect(errorsFor({ sessionNumber: 0 }, 'sessionNumber')).toHaveLength(0);
    });

    it('accepts the upper bound exactly', () => {
      expect(errorsFor({ sessionNumber: MAX_INT4 }, 'sessionNumber')).toHaveLength(0);
    });

    it.each([-1, MAX_INT4 + 1])('rejects %p, outside the column range', value => {
      expect(errorsFor({ sessionNumber: value }, 'sessionNumber').length).toBeGreaterThan(0);
    });

    it('rejects a non-integer', () => {
      expect(errorsFor({ sessionNumber: 1.5 }, 'sessionNumber').length).toBeGreaterThan(0);
    });
  });
});
