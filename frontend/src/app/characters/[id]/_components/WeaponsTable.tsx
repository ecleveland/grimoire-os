'use client';

import type { Character, Weapon } from '@/lib/types';
import { parseModifier, parseDiceExpression } from '@/lib/dice';
import { formatModifier } from './utils';
import { useDiceRoll } from './useDiceRoll';

interface WeaponsTableProps {
  character: Character;
  /** When true, each weapon gets attack/damage roll buttons (owner-only). */
  canRoll?: boolean;
}

/**
 * Apply an exhaustion d20 penalty to a manually-entered weapon's attack bonus
 * (VEG-449). The stored value is free text, so a row whose bonus doesn't parse
 * as a number (e.g. a spell-save "DC 15" entry — this column is
 * "Atk Bonus / DC") is left exactly as typed rather than rewritten to a
 * confidently-wrong number.
 */
function penalizeAttack(weapon: Weapon, d20Penalty: number): Weapon {
  if (d20Penalty === 0) return weapon;
  const parsed = parseModifier(weapon.attackBonus);
  if (parsed === null) return weapon;
  return { ...weapon, attackBonus: formatModifier(parsed + d20Penalty) };
}

export default function WeaponsTable({ character, canRoll }: WeaponsTableProps) {
  // Derived rows (from equipped gear, VEG-410) render first and get a tag;
  // manual entries keep working exactly as before. Both share the Weapon
  // shape, so the roll buttons don't care which kind a row is. `?? []`:
  // computed.weapons is absent under version skew (pre-VEG-410 backend).
  //
  // The exhaustion penalty is already baked into the derived rows by the
  // compute layer (VEG-449); manual rows carry a free-text bonus the player
  // typed, so it is applied here instead. Both kinds sit in one table with
  // identical Atk buttons, so penalizing only one would show two attacks with
  // the same weapon disagreeing by exactly the penalty.
  const d20Penalty = character.computed.exhaustion?.d20Penalty ?? 0;
  const rows = [
    ...(character.computed.weapons ?? []).map(weapon => ({ weapon, derived: true })),
    ...(character.weapons ?? []).map(weapon => ({
      weapon: penalizeAttack(weapon, d20Penalty),
      derived: false,
    })),
  ];
  const { rollCheck, rollDamage } = useDiceRoll();

  if (rows.length === 0) return null;

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase text-center mb-3">
        Weapons & Damage Cantrips
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-300 dark:border-gray-600">
            <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-1">
              Name
            </th>
            <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-1">
              Atk Bonus / DC
            </th>
            <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-1">
              Damage & Type
            </th>
            <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 pb-1">
              Notes
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ weapon, derived }, index) => {
            const attackMod = canRoll ? parseModifier(weapon.attackBonus) : null;
            const canRollDamage = canRoll && parseDiceExpression(weapon.damage) !== null;
            return (
              <tr
                key={index}
                className="border-b border-gray-100 dark:border-gray-700 last:border-0"
              >
                <td className="py-1.5 text-gray-900 dark:text-gray-100 font-medium">
                  {weapon.name}
                  {derived && (
                    <span
                      data-testid="derived-weapon-tag"
                      className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium uppercase rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300"
                    >
                      equipped
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-gray-700 dark:text-gray-300">
                  <span className="inline-flex items-center gap-2">
                    {weapon.attackBonus}
                    {attackMod !== null && (
                      <button
                        type="button"
                        aria-label={`Roll ${weapon.name} attack`}
                        onClick={() => rollCheck(`${weapon.name} attack`, attackMod)}
                        className="px-1.5 py-0.5 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        Atk
                      </button>
                    )}
                  </span>
                </td>
                <td className="py-1.5 text-gray-700 dark:text-gray-300">
                  <span className="inline-flex items-center gap-2">
                    {weapon.damage} {weapon.damageType}
                    {canRollDamage && (
                      <button
                        type="button"
                        aria-label={`Roll ${weapon.name} damage`}
                        onClick={() => rollDamage(`${weapon.name} damage`, weapon.damage)}
                        className="px-1.5 py-0.5 text-xs rounded bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        Dmg
                      </button>
                    )}
                  </span>
                </td>
                <td className="py-1.5 text-gray-500 dark:text-gray-400">{weapon.notes ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
