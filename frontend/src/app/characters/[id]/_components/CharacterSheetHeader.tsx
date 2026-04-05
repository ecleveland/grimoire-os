import Link from 'next/link';
import type { Character } from '@/lib/types';

interface CharacterSheetHeaderProps {
  character: Character;
  isOwner: boolean;
}

export default function CharacterSheetHeader({ character, isOwner }: CharacterSheetHeaderProps) {
  const fields: { label: string; value: string | undefined; testId: string }[] = [
    { label: 'Background', value: character.background, testId: 'field-background' },
    { label: 'Class', value: character.class, testId: 'field-class' },
    { label: 'Species', value: character.race, testId: 'field-species' },
    { label: 'Subclass', value: character.subclass, testId: 'field-subclass' },
  ];

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {character.name}
          </h1>

          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-3">
            {fields.map(({ label, value, testId }) => (
              <div key={label} data-testid={testId}>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  {label}
                </div>
                <div className="text-sm text-gray-900 dark:text-white">
                  {value ?? '—'}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 ml-4">
          <div className="text-center">
            <div
              data-testid="level-badge"
              className="w-12 h-12 rounded-full bg-indigo-600 text-white flex items-center justify-center text-lg font-bold"
            >
              {character.level}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {character.experiencePoints.toLocaleString()} XP
            </div>
          </div>

          {isOwner && (
            <Link
              href={`/characters/${character.id}/edit`}
              className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              Edit
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
