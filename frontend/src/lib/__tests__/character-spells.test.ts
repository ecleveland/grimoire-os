import { describe, it, expect } from 'vitest';
import type { SpellEntry, SrdSpell } from '@/lib/types';
import {
  addSpellEntry,
  removeSpellEntryAt,
  togglePreparedAt,
  toSpellEntry,
} from '../character-spells';

const spells: SpellEntry[] = [
  { level: 0, name: 'Fire Bolt' },
  { level: 1, name: 'Shield', prepared: true },
  { level: 3, name: 'Fireball', prepared: false, concentration: false, material: true },
];

const srdFireball: SrdSpell = {
  id: 'spell-1',
  name: 'Fireball',
  level: 3,
  school: 'Evocation',
  castingTime: '1 action',
  range: '150 feet',
  components: 'V, S, M',
  duration: 'Instantaneous',
  description: 'A bright streak…',
  classes: ['Wizard', 'Sorcerer'],
  ritual: false,
  concentration: false,
  material: 'a tiny ball of bat guano and sulfur',
  source: 'SRD',
};

describe('toSpellEntry (shared mapper, re-exported by guided spell-rules)', () => {
  it('maps catalog metadata, sets material from the components/material, links spellId', () => {
    expect(toSpellEntry(srdFireball)).toEqual({
      level: 3,
      name: 'Fireball',
      prepared: true, // leveled spells default prepared
      castingTime: '1 action',
      range: '150 feet',
      concentration: false,
      ritual: false,
      material: true,
      spellId: 'spell-1',
    });
  });

  it('marks a cantrip as not prepared (level 0)', () => {
    const cantrip = { ...srdFireball, id: 's2', name: 'Fire Bolt', level: 0, material: undefined };
    expect(toSpellEntry(cantrip).prepared).toBe(false);
  });
});

describe('addSpellEntry', () => {
  it('appends without mutating the original', () => {
    const next = addSpellEntry(spells, { level: 2, name: 'Misty Step' });
    expect(next).toHaveLength(4);
    expect(next[3].name).toBe('Misty Step');
    expect(spells).toHaveLength(3);
  });
});

describe('removeSpellEntryAt', () => {
  it('removes the entry at the index', () => {
    const next = removeSpellEntryAt(spells, 1);
    expect(next.map(s => s.name)).toEqual(['Fire Bolt', 'Fireball']);
  });

  it('is a no-op for an out-of-range index', () => {
    expect(removeSpellEntryAt(spells, 9)).toHaveLength(3);
  });
});

describe('togglePreparedAt', () => {
  it('flips the prepared flag at the index', () => {
    expect(togglePreparedAt(spells, 1)[1].prepared).toBe(false);
    expect(togglePreparedAt(spells, 2)[2].prepared).toBe(true);
  });

  it('treats an absent prepared flag as false → true', () => {
    expect(togglePreparedAt(spells, 0)[0].prepared).toBe(true);
  });

  it('does not mutate the original', () => {
    togglePreparedAt(spells, 1);
    expect(spells[1].prepared).toBe(true);
  });
});
