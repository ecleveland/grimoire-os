import type { Character } from '@/lib/types';

interface SpeciesTraitsAndFeatsProps {
  character: Character;
}

export default function SpeciesTraitsAndFeats({ character }: SpeciesTraitsAndFeatsProps) {
  const features = character.features ?? [];
  const speciesTraits = features.filter(f => f.source === character.race);
  const feats = features.filter(f => f.source !== character.class && f.source !== character.race);

  if (speciesTraits.length === 0 && feats.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase text-center mb-3">
          Species Traits
        </h3>
        <div className="space-y-3">
          {speciesTraits.map(feature => (
            <div key={feature.name}>
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {feature.name}
              </span>
              {feature.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {feature.description}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase text-center mb-3">
          Feats
        </h3>
        <div className="space-y-3">
          {feats.map(feature => (
            <div key={feature.name}>
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {feature.name}
              </span>
              {feature.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {feature.description}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
