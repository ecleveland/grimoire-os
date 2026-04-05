import type { Character } from '@/lib/types';

interface PersonalitySectionProps {
  character: Character;
}

const labelClass = 'text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400';

export default function PersonalitySection({ character }: PersonalitySectionProps) {
  const { appearance, backstory, personalityTraits, ideals, bonds, flaws, alignment } = character;

  const hasBackstorySection = backstory || personalityTraits || ideals || bonds || flaws;
  const hasContent = appearance || hasBackstorySection || alignment;

  if (!hasContent) return null;

  return (
    <div className="space-y-4">
      {/* Appearance */}
      {appearance && (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <h3 className={`${labelClass} mb-2`}>Appearance</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300">{appearance}</p>
        </div>
      )}

      {/* Backstory & Personality */}
      {hasBackstorySection && (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
          <h3 className={`${labelClass} mb-2`}>Backstory & Personality</h3>
          {backstory && (
            <p className="text-sm text-gray-700 dark:text-gray-300">{backstory}</p>
          )}
          {personalityTraits && (
            <div>
              <span className={labelClass}>Personality Traits</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{personalityTraits}</p>
            </div>
          )}
          {ideals && (
            <div>
              <span className={labelClass}>Ideals</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{ideals}</p>
            </div>
          )}
          {bonds && (
            <div>
              <span className={labelClass}>Bonds</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{bonds}</p>
            </div>
          )}
          {flaws && (
            <div>
              <span className={labelClass}>Flaws</span>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{flaws}</p>
            </div>
          )}
        </div>
      )}

      {/* Alignment */}
      {alignment && (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <span className={labelClass}>Alignment</span>
          <p className="text-sm text-gray-900 dark:text-gray-100 font-medium mt-1">{alignment}</p>
        </div>
      )}
    </div>
  );
}
