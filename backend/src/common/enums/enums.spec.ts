import { CombatantType } from '@grimoire-os/shared';

describe('CombatantType', () => {
  it('has PC and NPC values', () => {
    expect(CombatantType.PC).toBe('pc');
    expect(CombatantType.NPC).toBe('npc');
  });

  it('has exactly two members', () => {
    expect(Object.keys(CombatantType)).toHaveLength(2);
  });
});
