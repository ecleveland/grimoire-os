import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatsBar from '../StatsBar';
import { makeCharacter } from '@/test-utils/character';

const mockMessage = vi.fn();
vi.mock('sonner', () => ({ toast: { message: (...args: unknown[]) => mockMessage(...args) } }));

const mockCharacter = makeCharacter({
  abilityScores: {
    strength: 16,
    dexterity: 12,
    constitution: 14,
    intelligence: 10,
    wisdom: 14,
    charisma: 8,
  },
  skills: ['Perception', 'Athletics'],
  size: 'Small',
});

describe('StatsBar', () => {
  describe('Proficiency Bonus', () => {
    it('renders proficiency bonus calculated from level', () => {
      // level 5 → prof bonus +3
      render(<StatsBar character={mockCharacter} />);
      const block = screen.getByTestId('stat-prof-bonus');
      expect(within(block).getByText('+3')).toBeInTheDocument();
    });

    it('renders the label', () => {
      render(<StatsBar character={mockCharacter} />);
      expect(screen.getByText('Prof. Bonus')).toBeInTheDocument();
    });
  });

  describe('Initiative', () => {
    it('renders initiative as DEX modifier', () => {
      // DEX 12 → mod +1
      render(<StatsBar character={mockCharacter} />);
      const block = screen.getByTestId('stat-initiative');
      expect(within(block).getByText('+1')).toBeInTheDocument();
    });

    // The value renders through RollableStat. In the roll state it's a <button>,
    // and a block-level form control uses intrinsic (fit-content) width — it does
    // NOT stretch like a <span>, so it shrink-wraps to its label and pins to the
    // left of the text-center card. It must be w-full to fill the card and then
    // text-center to center the label (regression: rollable initiative left-aligned).
    it('stretches and centers the value in the static (non-roll) state', () => {
      render(<StatsBar character={mockCharacter} />);
      const block = screen.getByTestId('stat-initiative');
      expect(within(block).getByText('+1')).toHaveClass('w-full', 'text-center');
    });

    it('stretches and centers the value in the roll-button state', () => {
      render(<StatsBar character={mockCharacter} canRoll />);
      expect(screen.getByRole('button', { name: 'Roll initiative' })).toHaveClass(
        'w-full',
        'text-center'
      );
    });
  });

  describe('Speed', () => {
    it('renders speed with ft suffix', () => {
      render(<StatsBar character={mockCharacter} />);
      const block = screen.getByTestId('stat-speed');
      expect(within(block).getByText('25 ft')).toBeInTheDocument();
    });
  });

  describe('Size', () => {
    it('renders character size', () => {
      render(<StatsBar character={mockCharacter} />);
      const block = screen.getByTestId('stat-size');
      expect(within(block).getByText('Small')).toBeInTheDocument();
    });

    it('defaults to Medium when size is undefined', () => {
      const char = { ...mockCharacter, size: undefined };
      render(<StatsBar character={char} />);
      const block = screen.getByTestId('stat-size');
      expect(within(block).getByText('Medium')).toBeInTheDocument();
    });
  });

  describe('Passive Perception', () => {
    it('renders passive perception with proficiency when Perception is a skill', () => {
      // WIS 14 → mod +2, prof bonus +3, 10 + 2 + 3 = 15
      render(<StatsBar character={mockCharacter} />);
      const block = screen.getByTestId('stat-passive-perception');
      expect(within(block).getByText('15')).toBeInTheDocument();
    });

    it('renders passive perception without proficiency when Perception is not a skill', () => {
      // WIS 14 → mod +2, no prof, 10 + 2 = 12
      const char = { ...mockCharacter, skills: ['Athletics'] };
      render(<StatsBar character={char} />);
      const block = screen.getByTestId('stat-passive-perception');
      expect(within(block).getByText('12')).toBeInTheDocument();
    });
  });

  describe('initiative roll (canRoll)', () => {
    beforeEach(() => mockMessage.mockReset());

    it('does not render a roll button when canRoll is falsy', () => {
      render(<StatsBar character={mockCharacter} />);
      expect(screen.queryByRole('button', { name: /roll initiative/i })).toBeNull();
    });

    it('rolls initiative (d20 + DEX mod) and toasts the result', async () => {
      const user = userEvent.setup();
      render(<StatsBar character={mockCharacter} canRoll />);
      await user.click(screen.getByRole('button', { name: 'Roll initiative' }));
      expect(mockMessage).toHaveBeenCalledWith(expect.stringContaining('Initiative'));
    });
  });

  describe('labels', () => {
    it('renders all five stat labels', () => {
      render(<StatsBar character={mockCharacter} />);
      expect(screen.getByText('Prof. Bonus')).toBeInTheDocument();
      expect(screen.getByText('Initiative')).toBeInTheDocument();
      expect(screen.getByText('Speed')).toBeInTheDocument();
      expect(screen.getByText('Size')).toBeInTheDocument();
      expect(screen.getByText('Passive Perception')).toBeInTheDocument();
    });
  });
});

describe('null core stats (VEG-425)', () => {
  it('renders neutral values instead of crashing when abilityScores/speed are null', () => {
    const char = { ...mockCharacter, abilityScores: null, speed: null };
    render(<StatsBar character={char} />);
    // DEFAULT_ABILITY_SCORES (all 10) → +0 initiative; DEFAULT_SPEED → 30 ft.
    expect(within(screen.getByTestId('stat-initiative')).getByText('+0')).toBeInTheDocument();
    expect(within(screen.getByTestId('stat-speed')).getByText('30 ft')).toBeInTheDocument();
  });
});
