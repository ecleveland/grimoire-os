import type { Character } from '@/lib/types';

interface CombatBarProps {
  character: Character;
}

function hpBarColor(current: number, max: number): string {
  const pct = max > 0 ? current / max : 0;
  if (pct > 0.5) return 'bg-green-500';
  if (pct >= 0.25) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function CombatBar({ character }: CombatBarProps) {
  const { hitPoints, deathSaves, hitDice } = character;
  const hpPct = hitPoints.max > 0 ? (hitPoints.current / hitPoints.max) * 100 : 0;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      {/* Armor Class */}
      <div
        data-testid="ac-block"
        className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center"
      >
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          Armor Class
        </div>
        <div className="text-3xl font-bold text-gray-900 dark:text-white mt-1">
          {character.armorClass}
        </div>
      </div>

      {/* Hit Points */}
      <div
        data-testid="hp-block"
        className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center"
      >
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          Hit Points
        </div>
        <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
          {hitPoints.current}/{hitPoints.max}
        </div>
        {hitPoints.temporary > 0 && (
          <div className="text-xs text-blue-600 dark:text-blue-400">
            +{hitPoints.temporary} temp
          </div>
        )}
        <div className="mt-2 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            data-testid="hp-bar"
            className={`h-full rounded-full transition-all ${hpBarColor(hitPoints.current, hitPoints.max)}`}
            style={{ width: `${Math.min(hpPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Hit Dice */}
      {hitDice && (
        <div
          data-testid="hd-block"
          className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center"
        >
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Hit Dice
          </div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {hitDice.spent}/{hitDice.total}
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {hitDice.dieType}
          </div>
        </div>
      )}

      {/* Death Saves */}
      <div
        data-testid="death-saves-block"
        className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center"
      >
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          Death Saves
        </div>
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">S</span>
            {[0, 1, 2].map((i) => (
              <span
                key={`success-${i}`}
                data-testid={`death-success-${i}`}
                className={`inline-block w-3.5 h-3.5 rounded-full border ${
                  i < deathSaves.successes
                    ? 'bg-green-500 border-green-600'
                    : 'bg-transparent border-gray-300 dark:border-gray-600'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">F</span>
            {[0, 1, 2].map((i) => (
              <span
                key={`failure-${i}`}
                data-testid={`death-failure-${i}`}
                className={`inline-block w-3.5 h-3.5 rounded-full border ${
                  i < deathSaves.failures
                    ? 'bg-red-500 border-red-600'
                    : 'bg-transparent border-gray-300 dark:border-gray-600'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
