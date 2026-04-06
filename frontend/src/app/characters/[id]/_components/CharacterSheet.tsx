'use client';

import { useState } from 'react';
import type { Character } from '@/lib/types';
import CharacterSheetHeader from './CharacterSheetHeader';
import CombatBar from './CombatBar';
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
          <CombatBar character={character} />
          <StatsBar character={character} />
          <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
            <div className="space-y-6">
              <AbilityScoreColumn character={character} />
              <EquipmentTraining character={character} />
            </div>
            <div className="space-y-6">
              <WeaponsTable character={character} />
              <ClassFeatures character={character} />
              <SpeciesTraitsAndFeats character={character} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'spells' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SpellcastingSection character={character} />
          <div className="space-y-6">
            <PersonalitySection character={character} />
            <LanguagesSection character={character} />
            <InventorySection character={character} />
          </div>
        </div>
      )}
    </div>
  );
}
