import type { Combatant } from '@grimoire-os/shared';
import { stripCombatantsForCharacters } from './combatant-cleanup';

const pc = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'Aria',
  initiative: 12,
  hp: 20,
  maxHp: 20,
  ac: 15,
  isNpc: false,
  ...over,
});

describe('stripCombatantsForCharacters', () => {
  it('removes combatants linked to one of the given character ids', () => {
    const combatants = [
      pc({ name: 'Aria', characterId: 'char-1' }),
      pc({ name: 'Goblin', isNpc: true }),
      pc({ name: 'Bron', characterId: 'char-2' }),
    ];

    const result = stripCombatantsForCharacters(combatants, new Set(['char-1']));

    expect(result.removed).toBe(1);
    expect(result.combatants.map(c => c.name)).toEqual(['Goblin', 'Bron']);
  });

  it('keeps legacy combatants with no characterId', () => {
    const combatants = [pc({ name: 'Aria' }), pc({ name: 'Goblin', isNpc: true })];

    const result = stripCombatantsForCharacters(combatants, new Set(['char-1']));

    expect(result.removed).toBe(0);
    expect(result.combatants).toEqual(combatants);
  });

  it('reports no removal when nothing matches', () => {
    const combatants = [pc({ name: 'Aria', characterId: 'char-9' })];

    const result = stripCombatantsForCharacters(combatants, new Set(['char-1']));

    expect(result.removed).toBe(0);
    expect(result.combatants).toEqual(combatants);
  });

  it('removes every combatant when all are linked', () => {
    const combatants = [
      pc({ name: 'Aria', characterId: 'char-1' }),
      pc({ name: 'Bron', characterId: 'char-2' }),
    ];

    const result = stripCombatantsForCharacters(combatants, new Set(['char-1', 'char-2']));

    expect(result.removed).toBe(2);
    expect(result.combatants).toEqual([]);
  });

  it('treats a null combatants array as empty', () => {
    const result = stripCombatantsForCharacters(null, new Set(['char-1']));

    expect(result.removed).toBe(0);
    expect(result.combatants).toEqual([]);
  });

  it('keeps everything when the id set is empty', () => {
    const combatants = [pc({ name: 'Aria', characterId: 'char-1' })];

    const result = stripCombatantsForCharacters(combatants, new Set());

    expect(result.removed).toBe(0);
    expect(result.combatants).toEqual(combatants);
  });
});
