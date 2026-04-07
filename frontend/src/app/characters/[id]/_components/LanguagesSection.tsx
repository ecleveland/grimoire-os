import type { Character } from '@/lib/types';

interface LanguagesSectionProps {
  character: Character;
}

export default function LanguagesSection({ character }: LanguagesSectionProps) {
  if (!character.languages?.length) return null;

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase text-center mb-3">
        Languages
      </h3>
      <div className="flex flex-wrap gap-2">
        {character.languages.map(lang => (
          <span
            key={lang}
            className="px-2 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
          >
            {lang}
          </span>
        ))}
      </div>
    </div>
  );
}
