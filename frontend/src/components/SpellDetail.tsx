import Markdown from '@/components/Markdown';
import type { SrdSpell } from '@/lib/types';

/**
 * Expanded spell view shared by the spell browse modal and the unified-search
 * result card (VEG-294): casting stats grid, optional material / higher-levels
 * sections, Markdown description, and class chips.
 */
export default function SpellDetail({ spell }: { spell: SrdSpell }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Casting Time</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.castingTime}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Range</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.range}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Components</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.components}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Duration</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.duration}</p>
        </div>
      </div>
      {spell.material && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Material</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.material}</p>
        </div>
      )}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</h3>
        <Markdown>{spell.description}</Markdown>
      </div>
      {spell.higherLevels && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">At Higher Levels</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.higherLevels}</p>
        </div>
      )}
      {spell.classes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Classes</h3>
          <div className="flex flex-wrap gap-1 mt-1">
            {spell.classes.map(c => (
              <span
                key={c}
                className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
