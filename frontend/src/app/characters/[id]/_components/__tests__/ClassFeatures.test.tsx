import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ClassFeatures from '../ClassFeatures';
import type { Character } from '@/lib/types';
import { makeCharacter } from '@/test-utils/character';

const baseCharacter = makeCharacter({
  features: [
    { name: 'Second Wind', source: 'Fighter', description: 'Regain HP as a bonus action.' },
    { name: 'Action Surge', source: 'Fighter', description: 'Take an additional action.' },
    { name: 'Darkvision', source: 'Dwarf', description: 'See in dim light within 60 feet.' },
    { name: 'Great Weapon Master', source: 'Feat', description: 'Bonus attack on crit or kill.' },
  ],
});

describe('ClassFeatures', () => {
  it('renders the section header', () => {
    render(<ClassFeatures character={baseCharacter} />);
    expect(screen.getByText('Class Features')).toBeInTheDocument();
  });

  it('renders only features matching the character class', () => {
    render(<ClassFeatures character={baseCharacter} />);
    expect(screen.getByText('Second Wind')).toBeInTheDocument();
    expect(screen.getByText('Action Surge')).toBeInTheDocument();
    expect(screen.queryByText('Darkvision')).not.toBeInTheDocument();
    expect(screen.queryByText('Great Weapon Master')).not.toBeInTheDocument();
  });

  it('renders feature descriptions', () => {
    render(<ClassFeatures character={baseCharacter} />);
    expect(screen.getByText('Regain HP as a bonus action.')).toBeInTheDocument();
    expect(screen.getByText('Take an additional action.')).toBeInTheDocument();
  });

  it('renders source tags on features', () => {
    render(<ClassFeatures character={baseCharacter} />);
    const tags = screen.getAllByText('Fighter');
    expect(tags.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to all features when none match the class', () => {
    const char: Character = {
      ...baseCharacter,
      class: 'Wizard',
      features: [
        { name: 'Lucky', description: 'Reroll dice.' },
        { name: 'Tough', description: 'Extra HP.' },
      ],
    };
    render(<ClassFeatures character={char} />);
    expect(screen.getByText('Lucky')).toBeInTheDocument();
    expect(screen.getByText('Tough')).toBeInTheDocument();
  });

  it('renders features without descriptions gracefully', () => {
    const char: Character = {
      ...baseCharacter,
      features: [{ name: 'Second Wind', source: 'Fighter' }],
    };
    render(<ClassFeatures character={char} />);
    expect(screen.getByText('Second Wind')).toBeInTheDocument();
  });

  it('renders nothing when features array is empty', () => {
    const char = { ...baseCharacter, features: [] };
    const { container } = render(<ClassFeatures character={char} />);
    expect(container.innerHTML).toBe('');
  });

  // VEG-454. Rows were keyed on `feature.name` alone, which the level-up dedupe
  // existed to protect. Now that a recurring grant can legitimately appear twice,
  // the key has to separate them or React attaches state to the wrong sibling.
  describe('repeated feature names (VEG-454)', () => {
    const withRecurringAsi: Character = {
      ...baseCharacter,
      features: [
        { name: 'Ability Score Improvement', source: 'Fighter', level: 4 },
        { name: 'Ability Score Improvement', source: 'Fighter', level: 8 },
      ],
    };

    it('renders both grants of one recurring name', () => {
      render(<ClassFeatures character={withRecurringAsi} />);
      expect(screen.getAllByText('Ability Score Improvement')).toHaveLength(2);
    });

    it('does not warn about duplicate React keys', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<ClassFeatures character={withRecurringAsi} />);
      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });

    // Reachable without any level-up: CharacterEditorForm drops only blank-named
    // rows, so a player can type one name into two feature rows.
    it('does not warn for two hand-entered rows that are identical', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(
        <ClassFeatures
          character={{
            ...baseCharacter,
            features: [
              { name: 'Lucky', source: 'Fighter' },
              { name: 'Lucky', source: 'Fighter' },
            ],
          }}
        />
      );
      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
