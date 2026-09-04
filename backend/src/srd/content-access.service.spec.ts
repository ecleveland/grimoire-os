import { ForbiddenException } from '@nestjs/common';
import { ContentSource } from '@grimoire-os/shared';
import { ContentAccessService } from './content-access.service';

describe('ContentAccessService', () => {
  let service: ContentAccessService;

  beforeEach(() => {
    service = new ContentAccessService();
  });

  const admin = { userId: 'admin-1', isAdmin: true };
  const user = { userId: 'user-1', isAdmin: false };
  const otherUser = { userId: 'user-2', isAdmin: false };

  // Not a member of `ContentSource`. Cast past the type to stand in for a tier
  // added later (the schema already reserves `campaignId`) that reaches these
  // switches without a case of its own.
  const UNKNOWN_SOURCE = 'campaign' as unknown as ContentSource;

  // ── Visibility where-builders ──────────────────────────

  describe('globalWhere', () => {
    it('matches the global catalog: SRD + shared', () => {
      expect(service.globalWhere()).toEqual({ contentSource: { in: ['srd', 'shared'] } });
    });
  });

  describe('visibleTo', () => {
    it('returns the global catalog for an anonymous caller', () => {
      const global = { contentSource: { in: ['srd', 'shared'] } };
      expect(service.visibleTo()).toEqual(global);
      expect(service.visibleTo(undefined)).toEqual(global);
    });

    it('returns the global catalog plus the caller’s own homebrew when authed', () => {
      expect(service.visibleTo('user-1')).toEqual({
        OR: [{ contentSource: { in: ['srd', 'shared'] } }, { createdById: 'user-1' }],
      });
    });

    it('never references another user’s homebrew', () => {
      const where = JSON.stringify(service.visibleTo('user-1'));
      expect(where).toContain('user-1');
      expect(where).not.toContain('user-2');
    });
  });

  // ── Read authorization ─────────────────────────────────

  describe('canRead', () => {
    it('lets anyone read SRD and shared content', () => {
      for (const source of ['srd', 'shared'] as const) {
        expect(service.canRead({ contentSource: source, createdById: null })).toBe(true);
        expect(service.canRead({ contentSource: source, createdById: 'admin-1' }, 'user-9')).toBe(
          true
        );
      }
    });

    it('lets the owner read their homebrew but hides it from everyone else', () => {
      const row = { contentSource: 'homebrew' as const, createdById: 'user-1' };
      expect(service.canRead(row, 'user-1')).toBe(true);
      expect(service.canRead(row, 'user-2')).toBe(false);
      expect(service.canRead(row)).toBe(false);
    });
  });

  // ── Write authorization (update / delete) ──────────────

  describe('assertWritable', () => {
    it('never allows modifying SRD content — not even an admin', () => {
      const row = { contentSource: 'srd' as const, createdById: null };
      expect(() => service.assertWritable(row, admin)).toThrow(ForbiddenException);
      expect(() => service.assertWritable(row, user)).toThrow(ForbiddenException);
    });

    it('lets any admin modify shared content, but rejects non-admins', () => {
      const row = { contentSource: 'shared' as const, createdById: 'admin-2' };
      // A different admin than the creator may still write it.
      expect(() => service.assertWritable(row, admin)).not.toThrow();
      expect(() => service.assertWritable(row, user)).toThrow(ForbiddenException);
    });

    it('lets only the owner modify homebrew — not other users, not even admins', () => {
      const row = { contentSource: 'homebrew' as const, createdById: 'user-1' };
      expect(() => service.assertWritable(row, user)).not.toThrow();
      expect(() => service.assertWritable(row, otherUser)).toThrow(ForbiddenException);
      expect(() => service.assertWritable(row, admin)).toThrow(ForbiddenException);
    });

    it('denies a content source it does not recognize', () => {
      // `createdById` matches `user`, and `admin` is an admin, so both the homebrew
      // and the shared branch would authorize this row. Only the default can deny it,
      // which is what pins these assertions to the new branch.
      const row = { contentSource: UNKNOWN_SOURCE, createdById: 'user-1' };
      expect(() => service.assertWritable(row, user)).toThrow(ForbiddenException);
      expect(() => service.assertWritable(row, admin)).toThrow(ForbiddenException);
      expect(() => service.assertWritable(row, user)).toThrow('Unknown content source: campaign');
    });
  });

  // ── Create authorization ───────────────────────────────

  describe('assertCanCreate', () => {
    it('never allows creating SRD content (seed only)', () => {
      expect(() => service.assertCanCreate('srd', admin)).toThrow(ForbiddenException);
      expect(() => service.assertCanCreate('srd', user)).toThrow(ForbiddenException);
    });

    it('allows only admins to publish shared content', () => {
      expect(() => service.assertCanCreate('shared', admin)).not.toThrow();
      expect(() => service.assertCanCreate('shared', user)).toThrow(ForbiddenException);
    });

    it('allows any authenticated user to create homebrew', () => {
      expect(() => service.assertCanCreate('homebrew', user)).not.toThrow();
      expect(() => service.assertCanCreate('homebrew', admin)).not.toThrow();
    });

    it('denies a content source it does not recognize', () => {
      // An admin may create either writable tier, so a fall-through would read as
      // authorized for them. Only the default denies.
      expect(() => service.assertCanCreate(UNKNOWN_SOURCE, admin)).toThrow(ForbiddenException);
      expect(() => service.assertCanCreate(UNKNOWN_SOURCE, user)).toThrow(ForbiddenException);
      expect(() => service.assertCanCreate(UNKNOWN_SOURCE, admin)).toThrow(
        'Unknown content source: campaign'
      );
    });
  });
});
