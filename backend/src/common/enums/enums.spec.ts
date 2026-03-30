import { CombatantType } from '@grimoire-os/shared';
import {
  Role,
  CampaignStatus,
  NoteVisibility,
  AuditAction,
  CombatantType as BarrelCombatantType,
  UserRole,
} from './index';

describe('CombatantType', () => {
  it('has PC and NPC values', () => {
    expect(CombatantType.PC).toBe('pc');
    expect(CombatantType.NPC).toBe('npc');
  });

  it('has exactly two members', () => {
    expect(Object.keys(CombatantType)).toHaveLength(2);
  });
});

describe('common/enums barrel', () => {
  it('re-exports Role with correct values', () => {
    expect(Role.PLAYER).toBe('player');
    expect(Role.DUNGEON_MASTER).toBe('dungeon_master');
    expect(Role.ADMIN).toBe('admin');
  });

  it('re-exports CampaignStatus with correct values', () => {
    expect(CampaignStatus.ACTIVE).toBe('active');
    expect(CampaignStatus.PAUSED).toBe('paused');
    expect(CampaignStatus.COMPLETED).toBe('completed');
    expect(CampaignStatus.ARCHIVED).toBe('archived');
  });

  it('re-exports NoteVisibility with correct values', () => {
    expect(NoteVisibility.PRIVATE).toBe('private');
    expect(NoteVisibility.PARTY).toBe('party');
    expect(NoteVisibility.DM_ONLY).toBe('dm_only');
  });

  it('re-exports AuditAction with correct values', () => {
    expect(AuditAction.CREATE).toBe('create');
    expect(AuditAction.UPDATE).toBe('update');
    expect(AuditAction.DELETE).toBe('delete');
  });

  it('re-exports CombatantType via barrel', () => {
    expect(BarrelCombatantType.PC).toBe('pc');
    expect(BarrelCombatantType.NPC).toBe('npc');
  });

  it('re-exports UserRole with correct values', () => {
    expect(UserRole.PLAYER).toBe('player');
    expect(UserRole.DUNGEON_MASTER).toBe('dungeon_master');
    expect(UserRole.ADMIN).toBe('admin');
  });
});
