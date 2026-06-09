import { ForbiddenException } from '@nestjs/common';
import { HomebrewContentService } from './homebrew-content.service';

describe('HomebrewContentService', () => {
  let service: HomebrewContentService;

  beforeEach(() => {
    service = new HomebrewContentService();
  });

  // ── Visibility where-builders ──────────────────────────

  describe('srdOnly', () => {
    it('matches SRD content only', () => {
      expect(service.srdOnly()).toEqual({ contentSource: 'srd' });
    });
  });

  describe('visibleTo', () => {
    it('returns SRD-only for an anonymous caller', () => {
      expect(service.visibleTo()).toEqual({ contentSource: 'srd' });
      expect(service.visibleTo(undefined)).toEqual({ contentSource: 'srd' });
    });

    it('returns SRD plus the caller’s own homebrew for an authenticated user', () => {
      expect(service.visibleTo('user-1')).toEqual({
        OR: [{ contentSource: 'srd' }, { createdById: 'user-1' }],
      });
    });

    it('never exposes another user’s homebrew', () => {
      const where = service.visibleTo('user-1');
      // The only createdById referenced is the requesting user's.
      expect(JSON.stringify(where)).toContain('user-1');
      expect(JSON.stringify(where)).not.toContain('user-2');
    });
  });

  // ── Read authorization ─────────────────────────────────

  describe('canRead', () => {
    it('lets anyone read SRD content', () => {
      expect(service.canRead({ contentSource: 'srd', createdById: null })).toBe(true);
      expect(service.canRead({ contentSource: 'srd', createdById: null }, 'user-1')).toBe(true);
    });

    it('lets the owner read their homebrew', () => {
      expect(service.canRead({ contentSource: 'homebrew', createdById: 'user-1' }, 'user-1')).toBe(
        true
      );
    });

    it('hides another user’s homebrew', () => {
      expect(service.canRead({ contentSource: 'homebrew', createdById: 'user-1' }, 'user-2')).toBe(
        false
      );
      expect(service.canRead({ contentSource: 'homebrew', createdById: 'user-1' })).toBe(false);
    });
  });

  // ── Write authorization ────────────────────────────────

  describe('assertWritable', () => {
    it('rejects writes to SRD content (seed content is immutable)', () => {
      expect(() =>
        service.assertWritable({ contentSource: 'srd', createdById: null }, 'user-1')
      ).toThrow(ForbiddenException);
    });

    it('rejects writes to another user’s homebrew', () => {
      expect(() =>
        service.assertWritable({ contentSource: 'homebrew', createdById: 'user-1' }, 'user-2')
      ).toThrow(ForbiddenException);
    });

    it('allows the owner to write their own homebrew', () => {
      expect(() =>
        service.assertWritable({ contentSource: 'homebrew', createdById: 'user-1' }, 'user-1')
      ).not.toThrow();
    });
  });
});
