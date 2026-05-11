import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NpcStatBlockCard, type NpcStatBlockShape } from '../NpcStatBlockCard';

function buildStatBlock(over: Partial<NpcStatBlockShape> = {}): NpcStatBlockShape {
  return {
    baseMonster: 'Guard',
    name: 'Karda Steelhand',
    size: 'Medium',
    type: 'humanoid',
    subtype: null,
    alignment: 'Lawful Neutral',
    armorClass: 16,
    armorType: 'Chain Shirt, Shield',
    hitPoints: 11,
    hitDice: '2d8 + 2',
    speed: '30 ft.',
    str: 13,
    dex: 12,
    con: 12,
    int: 10,
    wis: 11,
    cha: 10,
    savingThrows: null,
    skills: { Perception: 2 },
    damageResistances: [],
    damageImmunities: [],
    damageVulnerabilities: [],
    conditionImmunities: [],
    senses: 'passive Perception 12',
    languages: 'Common',
    challengeRating: 0.125,
    experiencePoints: 25,
    specialAbilities: null,
    actions: [
      {
        name: 'Spear',
        description: 'Melee or Ranged Weapon Attack: +3 to hit. Hit: 4 (1d6 + 1) piercing damage.',
      },
    ],
    reactions: null,
    legendaryActions: null,
    professionWeaponSwap: { profession: 'guard', weapon: 'spear', replacedAction: 'Club' },
    ...over,
  };
}

describe('NpcStatBlockCard', () => {
  it('renders the header line with name, size, type, alignment', () => {
    render(<NpcStatBlockCard statBlock={buildStatBlock()} />);
    expect(screen.getByRole('heading', { name: /karda steelhand/i })).toBeInTheDocument();
    expect(screen.getByText(/medium humanoid, lawful neutral/i)).toBeInTheDocument();
  });

  it('renders AC, HP, speed', () => {
    render(<NpcStatBlockCard statBlock={buildStatBlock()} />);
    expect(screen.getByText(/AC/)).toBeInTheDocument();
    expect(screen.getByText(/16 \(Chain Shirt, Shield\)/i)).toBeInTheDocument();
    expect(screen.getByText(/11 \(2d8 \+ 2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/30 ft\./i)).toBeInTheDocument();
  });

  it('renders all six ability scores with modifiers', () => {
    render(<NpcStatBlockCard statBlock={buildStatBlock()} />);
    for (const label of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // STR 13 → +1; CHA 10 → +0 (two of each appear; assert at least one).
    expect(screen.getByText('13 (+1)')).toBeInTheDocument();
    expect(screen.getAllByText('10 (+0)').length).toBeGreaterThan(0);
  });

  it('renders the actions list', () => {
    render(<NpcStatBlockCard statBlock={buildStatBlock()} />);
    expect(screen.getByText(/^Actions$/)).toBeInTheDocument();
    expect(screen.getByText(/Spear\./i)).toBeInTheDocument();
  });

  it('surfaces the profession weapon swap in the header', () => {
    render(<NpcStatBlockCard statBlock={buildStatBlock()} />);
    expect(screen.getByText(/Based on Guard/i)).toBeInTheDocument();
    // The replaced action name ("Club") and the swap target ("spear") both appear in the header note.
    const swapNote = screen.getByText(/Based on Guard/i).closest('p');
    expect(swapNote?.textContent).toMatch(/Club/);
    expect(swapNote?.textContent).toMatch(/spear/i);
  });

  it('formats fractional CR cleanly', () => {
    render(<NpcStatBlockCard statBlock={buildStatBlock({ challengeRating: 0.25 })} />);
    expect(screen.getByText(/1\/4/)).toBeInTheDocument();
  });

  it('renders special abilities and reactions when present', () => {
    render(
      <NpcStatBlockCard
        statBlock={buildStatBlock({
          specialAbilities: [{ name: 'Pack Tactics', description: 'Advantage on ally attacks.' }],
          reactions: [{ name: 'Parry', description: '+2 AC on melee attack.' }],
        })}
      />
    );
    expect(screen.getByText(/Special Abilities/)).toBeInTheDocument();
    expect(screen.getByText(/Pack Tactics\./i)).toBeInTheDocument();
    expect(screen.getByText(/^Reactions$/)).toBeInTheDocument();
    expect(screen.getByText(/Parry\./i)).toBeInTheDocument();
  });
});
