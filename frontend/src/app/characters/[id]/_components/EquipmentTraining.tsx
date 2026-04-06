import type { Character } from '@/lib/types';

interface EquipmentTrainingProps {
  character: Character;
}

const ARMOR_TYPES = ['Light', 'Medium', 'Heavy', 'Shields'] as const;

export default function EquipmentTraining({ character }: EquipmentTrainingProps) {
  const armorTraining = character.armorTraining ?? [];
  const proficiencies = character.proficiencies ?? [];
  const hasContent =
    armorTraining.length > 0 ||
    proficiencies.length > 0 ||
    character.heroicInspiration;

  if (!hasContent) return null;

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
      {/* Heroic Inspiration */}
      <div className="flex items-center gap-2">
        <span
          data-testid="heroic-inspiration"
          className={`inline-block w-4 h-4 rounded ${
            character.heroicInspiration
              ? 'bg-indigo-600 dark:bg-indigo-400'
              : 'bg-gray-300 dark:bg-gray-600'
          }`}
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Heroic Inspiration
        </span>
      </div>

      {/* Armor Training */}
      <div>
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
          Armor Training
        </h3>
        <div className="flex flex-wrap gap-3">
          {ARMOR_TYPES.map((type) => {
            const isTrained = armorTraining.includes(type);
            return (
              <div key={type} className="flex items-center gap-1.5">
                <span
                  data-testid={`armor-dot-${type.toLowerCase()}`}
                  className={`inline-block w-2.5 h-2.5 rounded-full ${
                    isTrained
                      ? 'bg-indigo-600 dark:bg-indigo-400'
                      : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{type}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Proficiencies */}
      {proficiencies.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
            Proficiencies
          </h3>
          <div className="flex flex-wrap gap-2">
            {proficiencies.map((p) => (
              <span
                key={p}
                className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
