'use client';

import type { Character } from '@/lib/types';
import { parseModifier, parseDiceExpression } from '@/lib/dice';
import { useDiceRoll } from './useDiceRoll';

interface WeaponsTableProps {
  character: Character;
  /** When true, each weapon gets attack/damage roll buttons (owner-only). */
  canRoll?: boolean;
}

export default function WeaponsTable({ character, canRoll }: WeaponsTableProps) {
  const weapons = character.weapons;
  const { rollCheck, rollDamage } = useDiceRoll();

  if (!weapons || weapons.length === 0) return null;

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
          {weapons.map(weapon => {
            const attackMod = canRoll ? parseModifier(weapon.attackBonus) : null;
            const canRollDamage = canRoll && parseDiceExpression(weapon.damage) !== null;
            return (
              <tr
                key={weapon.name}
                className="border-b border-gray-100 dark:border-gray-700 last:border-0"
              >
                <td className="py-1.5 text-gray-900 dark:text-gray-100 font-medium">
                  {weapon.name}
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
