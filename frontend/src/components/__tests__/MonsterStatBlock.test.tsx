import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MonsterStatBlock from '../MonsterStatBlock';
import type { SrdMonster } from '@/lib/types';

const fullMonster: SrdMonster = {
  id: 'monster-1',
  name: 'Goblin',
  size: 'Small',
  type: 'Humanoid',
  subtype: 'goblinoid',
  alignment: 'Neutral Evil',
  armorClass: 15,
  armorType: 'leather armor, shield',
  hitPoints: 7,
  hitDice: '2d6',
  speed: '30 ft.',
  str: 8,
  dex: 14,
  con: 10,
  int: 10,
  wis: 8,
  cha: 8,
  savingThrows: { Dex: 2 },
  skills: { Stealth: 6 },
  damageResistances: ['cold'],
  damageImmunities: ['poison'],
  damageVulnerabilities: ['fire'],
  conditionImmunities: ['charmed'],
  senses: 'darkvision 60 ft.',
  languages: 'Common, Goblin',
  challengeRating: 0.25,
  experiencePoints: 50,
  specialAbilities: [{ name: 'Nimble Escape', description: 'Can Disengage as a bonus action.' }],
  actions: [{ name: 'Scimitar', description: 'Melee attack: +4 to hit, 1d6+2 slashing.' }],
  reactions: [{ name: 'Parry', description: 'Add 2 to AC against one attack.' }],
  legendaryActions: [{ name: 'Move', description: 'The goblin moves up to its speed.' }],
  description: 'Small black-hearted humanoids that live in caves.',
  source: 'SRD 5.2.1',
};

const sparseMonster: SrdMonster = {
  id: 'monster-2',
  name: 'Commoner',
  size: 'Medium',
  type: 'Humanoid',
  alignment: 'Any Alignment',
  armorClass: 10,
  hitPoints: 4,
  speed: '30 ft.',
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
  damageResistances: [],
  damageImmunities: [],
  damageVulnerabilities: [],
  conditionImmunities: [],
  challengeRating: 0,
  actions: [{ name: 'Club', description: 'Melee attack: +2 to hit, 1d4 bludgeoning.' }],
  source: 'SRD 5.2.1',
};

describe('MonsterStatBlock', () => {
  describe('fully-populated monster', () => {
    it('renders the name, subtitle, and CR with XP', () => {
      render(<MonsterStatBlock monster={fullMonster} />);
      expect(screen.getByRole('heading', { name: 'Goblin' })).toBeInTheDocument();
      expect(screen.getByText(/Small Humanoid \(goblinoid\)/)).toBeInTheDocument();
      expect(screen.getByText(/Neutral Evil/)).toBeInTheDocument();
      expect(screen.getByText(/CR 1\/4/)).toBeInTheDocument();
      expect(screen.getByText(/50 XP/)).toBeInTheDocument();
    });

    it('renders AC (with type), HP (with dice), and Speed', () => {
      render(<MonsterStatBlock monster={fullMonster} />);
      expect(screen.getByText(/15/)).toBeInTheDocument();
      expect(screen.getByText(/leather armor, shield/)).toBeInTheDocument();
      expect(screen.getByText(/2d6/)).toBeInTheDocument();
      expect(screen.getByText('30 ft.')).toBeInTheDocument();
    });

    it('renders ability scores with computed modifiers (incl. negative and zero)', () => {
      render(<MonsterStatBlock monster={fullMonster} />);
      // STR 8, WIS 8, CHA 8 all map to -1
      expect(screen.getAllByText('8 (-1)')).toHaveLength(3);
      expect(screen.getByText('14 (+2)')).toBeInTheDocument(); // DEX 14 -> +2
      // CON 10, INT 10 both map to +0
      expect(screen.getAllByText('10 (+0)')).toHaveLength(2);
    });

    it('renders saving throws, skills, defenses, senses, and languages', () => {
      render(<MonsterStatBlock monster={fullMonster} />);
      expect(screen.getByText('Saving Throws')).toBeInTheDocument();
      expect(screen.getByText('Skills')).toBeInTheDocument();
      expect(screen.getByText('Damage Resistances')).toBeInTheDocument();
      expect(screen.getByText('Damage Immunities')).toBeInTheDocument();
      expect(screen.getByText('Damage Vulnerabilities')).toBeInTheDocument();
      expect(screen.getByText('Condition Immunities')).toBeInTheDocument();
      expect(screen.getByText('Senses')).toBeInTheDocument();
      expect(screen.getByText('Languages')).toBeInTheDocument();
    });

    it('renders all action sections', () => {
      render(<MonsterStatBlock monster={fullMonster} />);
      expect(screen.getByRole('heading', { name: 'Traits' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Actions' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Reactions' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Legendary Actions' })).toBeInTheDocument();
      expect(screen.getByText('Nimble Escape.')).toBeInTheDocument();
      expect(screen.getByText(/Melee attack: \+4 to hit/)).toBeInTheDocument();
    });

    it('renders the description and source', () => {
      render(<MonsterStatBlock monster={fullMonster} />);
      expect(
        screen.getByText('Small black-hearted humanoids that live in caves.')
      ).toBeInTheDocument();
      expect(screen.getByText(/SRD 5\.2\.1/)).toBeInTheDocument();
    });
  });

  describe('sparse monster', () => {
    it('omits absent sections and rows entirely', () => {
      render(<MonsterStatBlock monster={sparseMonster} />);
      // Sections
      expect(screen.queryByRole('heading', { name: 'Traits' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Reactions' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Legendary Actions' })).not.toBeInTheDocument();
      // Rows
      expect(screen.queryByText('Saving Throws')).not.toBeInTheDocument();
      expect(screen.queryByText('Skills')).not.toBeInTheDocument();
      expect(screen.queryByText('Damage Resistances')).not.toBeInTheDocument();
      expect(screen.queryByText('Condition Immunities')).not.toBeInTheDocument();
      expect(screen.queryByText('Senses')).not.toBeInTheDocument();
      expect(screen.queryByText('Languages')).not.toBeInTheDocument();
    });

    it('renders CR without XP when experiencePoints is absent', () => {
      render(<MonsterStatBlock monster={sparseMonster} />);
      expect(screen.getByText(/CR 0/)).toBeInTheDocument();
      expect(screen.queryByText(/XP/)).not.toBeInTheDocument();
    });

    it('still renders the required Actions section', () => {
      render(<MonsterStatBlock monster={sparseMonster} />);
      expect(screen.getByRole('heading', { name: 'Actions' })).toBeInTheDocument();
      expect(screen.getByText('Club.')).toBeInTheDocument();
    });
  });
});
