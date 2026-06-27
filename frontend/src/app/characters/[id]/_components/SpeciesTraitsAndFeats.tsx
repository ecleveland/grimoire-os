import type { Character } from '@/lib/types';

interface SpeciesTraitsAndFeatsProps {
  character: Character;
}

export default function SpeciesTraitsAndFeats({ character }: SpeciesTraitsAndFeatsProps) {
  const features = character.features ?? [];
  const speciesTraits = features.filter(f => f.source === character.race);
  // Feats come from two places: the structured `feats` field (VEG-430), each
  // with an optional chosen option (e.g. Magic Initiate "Cleric"), plus — for
  // backward compatibility — any legacy/manually-entered `features` whose source
  // is neither the class nor the race (the classic editor's FeaturesEditor still
  // allows a "Feat"/blank source). Those carry a description; structured feats
  // carry the option.
  const grantedFeats = character.feats ?? [];
  const grantedNames = new Set(grantedFeats.map(f => f.name));
  const featureFeats = features.filter(
    f =>
      f.source !== character.class &&
      f.source !== character.race &&
      // Don't double-list a feat that's already in the structured `feats` field
      // (e.g. a guided-granted feat the user also re-typed in the classic editor).
      !grantedNames.has(f.name)
  );

  if (speciesTraits.length === 0 && featureFeats.length === 0 && grantedFeats.length === 0) {
    return null;
  }

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
          {grantedFeats.map(feat => (
            <div key={`feat:${feat.featId ?? feat.name}:${feat.option ?? ''}`}>
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {feat.name}
                {feat.option && (
                  <span className="font-normal text-gray-600 dark:text-gray-400">
                    {' '}
                    ({feat.option})
                  </span>
                )}
              </span>
            </div>
          ))}
          {featureFeats.map(feature => (
            <div key={`feature:${feature.name}`}>
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
