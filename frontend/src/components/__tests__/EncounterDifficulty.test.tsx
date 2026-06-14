import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import EncounterDifficulty from '@/components/EncounterDifficulty';
import type { Combatant } from '@/lib/types';

const monster = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'Goblin',
  initiative: 12,
  hp: 7,
  maxHp: 7,
  ac: 15,
  isNpc: true,
  monsterId: 'mon-goblin',
  cr: 0.25,
  xp: 50,
  ...over,
});

const pc = (over: Partial<Combatant> = {}): Combatant => ({
  name: 'Aragorn',
  initiative: 10,
  hp: 40,
  maxHp: 45,
  ac: 16,
  isNpc: false,
  level: 3,
  ...over,
});

describe('EncounterDifficulty', () => {
  it('shows the empty state when there are no monsters', () => {
    render(<EncounterDifficulty combatants={[pc()]} />);
    expect(screen.getByTestId('encounter-difficulty')).toHaveTextContent(/no monsters yet/i);
    expect(screen.queryByTestId('difficulty-band')).not.toBeInTheDocument();
  });

  it('shows count, total XP, summed CR, and the difficulty band', () => {
    render(
      <EncounterDifficulty
        combatants={[
          monster({ cr: 0.25, xp: 50 }),
          monster({ name: 'Goblin 2', cr: 0.25, xp: 50 }),
          monster({ name: 'Goblin 3', cr: 0.25, xp: 50 }),
          pc({ level: 3 }),
        ]}
      />
    );
    const el = screen.getByTestId('encounter-difficulty');
    expect(el).toHaveTextContent('3 monsters');
    expect(el).toHaveTextContent('150 XP');
    expect(el).toHaveTextContent('CR 0.75'); // summed 0.25*3; non-special fractions print as decimals
    // 150 XP <= level-3 low budget (150) -> Low.
    expect(within(el).getByTestId('difficulty-band')).toHaveTextContent('Low');
  });

  it('formats large XP totals with a thousands separator', () => {
    render(<EncounterDifficulty combatants={[monster({ cr: 5, xp: 1800 }), pc({ level: 1 })]} />);
    expect(screen.getByTestId('encounter-difficulty')).toHaveTextContent('1,800 XP');
  });

  it('rates an over-budget encounter as Deadly', () => {
    render(<EncounterDifficulty combatants={[monster({ cr: 1, xp: 200 }), pc({ level: 1 })]} />);
    expect(screen.getByTestId('difficulty-band')).toHaveTextContent('Deadly');
  });

  it('prompts to add the party when no PC has a level', () => {
    render(<EncounterDifficulty combatants={[monster(), pc({ level: undefined })]} />);
    expect(screen.queryByTestId('difficulty-band')).not.toBeInTheDocument();
    expect(screen.getByTestId('encounter-difficulty')).toHaveTextContent(/add party pcs/i);
  });

  it('uses the singular noun for a single monster', () => {
    render(<EncounterDifficulty combatants={[monster()]} />);
    expect(screen.getByTestId('encounter-difficulty')).toHaveTextContent('1 monster');
    expect(screen.getByTestId('encounter-difficulty')).not.toHaveTextContent('1 monsters');
  });
});
