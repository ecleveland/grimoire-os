import { describe, it, expect } from 'vitest';
import type { Combatant } from '@/lib/types';
import {
  clearDeathSavesIfRevived,
  deathSaveStatus,
  markDeathSave,
  showsDeathSaves,
} from '@/lib/death-saves';

const pc = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'Hero',
  initiative: 10,
  hp: 0,
  maxHp: 20,
  ac: 15,
  isNpc: false,
  ...over,
});

describe('showsDeathSaves', () => {
  it('is true only for a non-NPC at 0 or below HP', () => {
    expect(showsDeathSaves({ isNpc: false, hp: 0 })).toBe(true);
    expect(showsDeathSaves({ isNpc: false, hp: -3 })).toBe(true);
  });

  it('is false for a PC above 0 HP and for any NPC', () => {
    expect(showsDeathSaves({ isNpc: false, hp: 1 })).toBe(false);
    expect(showsDeathSaves({ isNpc: true, hp: 0 })).toBe(false);
  });
});

describe('deathSaveStatus', () => {
  it('treats absent saves as dying (0/0)', () => {
    expect(deathSaveStatus(undefined)).toBe('dying');
    expect(deathSaveStatus({ successes: 1, failures: 2 })).toBe('dying');
  });

  it('is stable at 3 successes and dead at 3 failures', () => {
    expect(deathSaveStatus({ successes: 3, failures: 0 })).toBe('stable');
    expect(deathSaveStatus({ successes: 0, failures: 3 })).toBe('dead');
  });

  it('dead wins when both somehow reach 3', () => {
    expect(deathSaveStatus({ successes: 3, failures: 3 })).toBe('dead');
  });
});

describe('markDeathSave', () => {
  it('increments from absent (0/0)', () => {
    expect(markDeathSave(undefined, 'success')).toEqual({ successes: 1, failures: 0 });
    expect(markDeathSave(undefined, 'failure')).toEqual({ successes: 0, failures: 1 });
  });

  it('caps each tally at 3', () => {
    expect(markDeathSave({ successes: 3, failures: 1 }, 'success')).toEqual({
      successes: 3,
      failures: 1,
    });
    expect(markDeathSave({ successes: 1, failures: 3 }, 'failure')).toEqual({
      successes: 1,
      failures: 3,
    });
  });

  it('does not mutate its input', () => {
    const saves = { successes: 1, failures: 1 };
    markDeathSave(saves, 'success');
    expect(saves).toEqual({ successes: 1, failures: 1 });
  });
});

describe('clearDeathSavesIfRevived', () => {
  it('drops deathSaves once HP is above 0', () => {
    const revived = clearDeathSavesIfRevived(
      pc({ hp: 5, deathSaves: { successes: 1, failures: 2 } })
    );
    expect(revived).not.toHaveProperty('deathSaves');
  });

  it('keeps deathSaves while still down', () => {
    const down = pc({ hp: 0, deathSaves: { successes: 1, failures: 0 } });
    expect(clearDeathSavesIfRevived(down).deathSaves).toEqual({ successes: 1, failures: 0 });
  });

  it('is a no-op (same reference) when there are no saves', () => {
    const alive = pc({ hp: 10 });
    expect(clearDeathSavesIfRevived(alive)).toBe(alive);
  });
});
