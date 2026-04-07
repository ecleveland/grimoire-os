import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CharacterSheet from '../CharacterSheet';
import type { Character } from '@/lib/types';

vi.mock('../CharacterSheetHeader', () => ({
  default: ({ character, isOwner }: { character: Character; isOwner: boolean }) => (
    <div data-testid="CharacterSheetHeader" data-owner={isOwner}>
      {character.name}
    </div>
  ),
}));
vi.mock('../CombatBar', () => ({
  default: () => <div data-testid="CombatBar" />,
}));
vi.mock('../StatsBar', () => ({
  default: () => <div data-testid="StatsBar" />,
}));
vi.mock('../AbilityScoreColumn', () => ({
  default: () => <div data-testid="AbilityScoreColumn" />,
}));
vi.mock('../EquipmentTraining', () => ({
  default: () => <div data-testid="EquipmentTraining" />,
}));
vi.mock('../WeaponsTable', () => ({
  default: () => <div data-testid="WeaponsTable" />,
}));
vi.mock('../ClassFeatures', () => ({
  default: () => <div data-testid="ClassFeatures" />,
}));
vi.mock('../SpeciesTraitsAndFeats', () => ({
  default: () => <div data-testid="SpeciesTraitsAndFeats" />,
}));
vi.mock('../SpellcastingSection', () => ({
  default: () => <div data-testid="SpellcastingSection" />,
}));
vi.mock('../PersonalitySection', () => ({
  default: () => <div data-testid="PersonalitySection" />,
}));
vi.mock('../LanguagesSection', () => ({
  default: () => <div data-testid="LanguagesSection" />,
}));
vi.mock('../InventorySection', () => ({
  default: () => <div data-testid="InventorySection" />,
}));

const mockCharacter: Character = {
  id: 'char-1',
  userId: 'user-1',
  name: 'Thorin Ironforge',
  race: 'Dwarf',
  class: 'Fighter',
  level: 5,
  subclass: 'Champion',
  background: 'Soldier',
  alignment: 'Lawful Good',
  experiencePoints: 6500,
  abilityScores: {
    strength: 16,
    dexterity: 12,
    constitution: 14,
    intelligence: 10,
    wisdom: 13,
    charisma: 8,
  },
  hitPoints: { max: 44, current: 44, temporary: 0 },
  deathSaves: { successes: 0, failures: 0 },
  armorClass: 18,
  speed: 25,
  initiative: 1,
  proficiencies: [],
  languages: [],
  savingThrows: [],
  skills: [],
  knownSpells: [],
  preparedSpells: [],
  spellSlots: [],
  inventory: [],
  currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  features: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('CharacterSheet', () => {
  describe('tab switcher', () => {
    it('renders Character tab as active by default', () => {
      render(<CharacterSheet character={mockCharacter} isOwner={false} />);
      const characterTab = screen.getByRole('tab', { name: 'Character' });
      expect(characterTab).toHaveAttribute('aria-selected', 'true');
    });

    it('renders Spells & Details tab as inactive by default', () => {
      render(<CharacterSheet character={mockCharacter} isOwner={false} />);
      const spellsTab = screen.getByRole('tab', { name: 'Spells & Details' });
      expect(spellsTab).toHaveAttribute('aria-selected', 'false');
    });

    it('switches to Spells & Details tab on click', async () => {
      const user = userEvent.setup();
      render(<CharacterSheet character={mockCharacter} isOwner={false} />);

      await user.click(screen.getByRole('tab', { name: 'Spells & Details' }));

      expect(screen.getByRole('tab', { name: 'Spells & Details' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(screen.getByRole('tab', { name: 'Character' })).toHaveAttribute(
        'aria-selected',
        'false'
      );
    });

    it('switches back to Character tab on click', async () => {
      const user = userEvent.setup();
      render(<CharacterSheet character={mockCharacter} isOwner={false} />);

      await user.click(screen.getByRole('tab', { name: 'Spells & Details' }));
      await user.click(screen.getByRole('tab', { name: 'Character' }));

      expect(screen.getByRole('tab', { name: 'Character' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
    });
  });

  describe('Character tab content', () => {
    it('renders all Character tab components by default', () => {
      render(<CharacterSheet character={mockCharacter} isOwner={false} />);
      expect(screen.getByTestId('CharacterSheetHeader')).toBeInTheDocument();
      expect(screen.getByTestId('CombatBar')).toBeInTheDocument();
      expect(screen.getByTestId('StatsBar')).toBeInTheDocument();
      expect(screen.getByTestId('AbilityScoreColumn')).toBeInTheDocument();
      expect(screen.getByTestId('EquipmentTraining')).toBeInTheDocument();
      expect(screen.getByTestId('WeaponsTable')).toBeInTheDocument();
      expect(screen.getByTestId('ClassFeatures')).toBeInTheDocument();
      expect(screen.getByTestId('SpeciesTraitsAndFeats')).toBeInTheDocument();
    });

    it('does not render Spells & Details components on Character tab', () => {
      render(<CharacterSheet character={mockCharacter} isOwner={false} />);
      expect(screen.queryByTestId('SpellcastingSection')).not.toBeInTheDocument();
      expect(screen.queryByTestId('PersonalitySection')).not.toBeInTheDocument();
      expect(screen.queryByTestId('LanguagesSection')).not.toBeInTheDocument();
      expect(screen.queryByTestId('InventorySection')).not.toBeInTheDocument();
    });
  });

  describe('Spells & Details tab content', () => {
    it('renders all Spells & Details components when tab is active', async () => {
      const user = userEvent.setup();
      render(<CharacterSheet character={mockCharacter} isOwner={false} />);

      await user.click(screen.getByRole('tab', { name: 'Spells & Details' }));

      expect(screen.getByTestId('SpellcastingSection')).toBeInTheDocument();
      expect(screen.getByTestId('PersonalitySection')).toBeInTheDocument();
      expect(screen.getByTestId('LanguagesSection')).toBeInTheDocument();
      expect(screen.getByTestId('InventorySection')).toBeInTheDocument();
    });

    it('does not render Character tab components when Spells & Details is active', async () => {
      const user = userEvent.setup();
      render(<CharacterSheet character={mockCharacter} isOwner={false} />);

      await user.click(screen.getByRole('tab', { name: 'Spells & Details' }));

      expect(screen.queryByTestId('CharacterSheetHeader')).not.toBeInTheDocument();
      expect(screen.queryByTestId('CombatBar')).not.toBeInTheDocument();
      expect(screen.queryByTestId('StatsBar')).not.toBeInTheDocument();
    });
  });

  describe('props', () => {
    it('passes isOwner to CharacterSheetHeader', () => {
      render(<CharacterSheet character={mockCharacter} isOwner={true} />);
      expect(screen.getByTestId('CharacterSheetHeader')).toHaveAttribute('data-owner', 'true');
    });

    it('passes isOwner=false to CharacterSheetHeader', () => {
      render(<CharacterSheet character={mockCharacter} isOwner={false} />);
      expect(screen.getByTestId('CharacterSheetHeader')).toHaveAttribute('data-owner', 'false');
    });
  });

  describe('layout', () => {
    it('uses max-w-5xl container', () => {
      const { container } = render(<CharacterSheet character={mockCharacter} isOwner={false} />);
      expect(container.firstChild).toHaveClass('max-w-5xl');
    });
  });
});
