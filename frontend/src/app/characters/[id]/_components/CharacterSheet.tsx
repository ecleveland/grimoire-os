'use client';

import { useState } from 'react';
import type { Character } from '@/lib/types';
import { useCharacterMutation, type PlayControlProps } from './useCharacterMutation';
import CharacterSheetHeader from './CharacterSheetHeader';
import LevelUpSection from './LevelUpSection';
import CombatBar from './CombatBar';
import StatusTracker from './StatusTracker';
import StatsBar from './StatsBar';
import AbilityScoreColumn from './AbilityScoreColumn';
import EquipmentTraining from './EquipmentTraining';
import WeaponsTable from './WeaponsTable';
import ClassFeatures from './ClassFeatures';
import SpeciesTraitsAndFeats from './SpeciesTraitsAndFeats';
import SpellcastingSection from './SpellcastingSection';
import PersonalitySection from './PersonalitySection';
import LanguagesSection from './LanguagesSection';
import InventorySection from './InventorySection';

interface CharacterSheetProps {
  character: Character;
  isOwner: boolean;
}

type Tab = 'character' | 'spells';

const TABS: { key: Tab; label: string }[] = [
  { key: 'character', label: 'Character' },
  { key: 'spells', label: 'Spells & Details' },
];

export default function CharacterSheet({ character, isOwner }: CharacterSheetProps) {
  const [activeTab, setActiveTab] = useState<Tab>('character');
  const { patch, isSaving } = useCharacterMutation(character);
  // One editable/read-only descriptor spread into every play-control section.
  const controls: PlayControlProps = isOwner
    ? { editable: true, onPatch: patch, isSaving }
    : { editable: false };

  return (
    <div className="max-w-5xl mx-auto">
      <div role="tablist" className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeTab === key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium -mb-px transition-colors ${
              activeTab === key
                ? 'border-b-2 border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'character' && (
        <div className="space-y-6">
          <CharacterSheetHeader character={character} isOwner={isOwner} />
          <LevelUpSection character={character} {...controls} />
          <CombatBar character={character} {...controls} />
          <StatusTracker character={character} {...controls} />
          <StatsBar character={character} canRoll={isOwner} />
          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
            <div className="space-y-6">
              <AbilityScoreColumn character={character} canRoll={isOwner} />
              <EquipmentTraining character={character} />
            </div>
            <div className="space-y-6">
              <WeaponsTable character={character} canRoll={isOwner} />
              <ClassFeatures character={character} />
              <SpeciesTraitsAndFeats character={character} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'spells' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SpellcastingSection character={character} {...controls} />
          <div className="space-y-6">
            <PersonalitySection character={character} />
            <LanguagesSection character={character} />
            <InventorySection character={character} {...controls} />
          </div>
        </div>
      )}
    </div>
  );
}
