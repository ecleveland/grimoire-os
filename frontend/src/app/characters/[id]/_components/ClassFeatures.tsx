import type { Character } from '@/lib/types';

interface ClassFeaturesProps {
  character: Character;
}

export default function ClassFeatures({ character }: ClassFeaturesProps) {
  const allFeatures = character.features ?? [];

  if (allFeatures.length === 0) return null;

  const classFeatures = allFeatures.filter((f) => f.source === character.class);
  const displayFeatures = classFeatures.length > 0 ? classFeatures : allFeatures;

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase text-center mb-3">
        Class Features
      </h3>
      <div className="space-y-3">
        {displayFeatures.map((feature) => (
          <div key={feature.name}>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {feature.name}
              </span>
              {feature.source && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                  {feature.source}
                </span>
              )}
            </div>
            {feature.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {feature.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
