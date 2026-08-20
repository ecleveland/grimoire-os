import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StatsBar from '../StatsBar';
import type { Character } from '@/lib/types';
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

    describe('bonus breakdown (VEG-452)', () => {
      const withInitiative = (over: Partial<Character> = {}) =>
        makeCharacter({
          abilityScores: {
            strength: 16,
            dexterity: 12,
            constitution: 14,
            intelligence: 10,
            wisdom: 14,
            charisma: 8,
          },
          size: 'Small',
          ...over,
        });

      it('shows no breakdown when Dexterity is the only contribution', () => {
        render(<StatsBar character={withInitiative()} />);
        expect(screen.queryByTestId('initiative-breakdown')).toBeNull();
      });

      it('adds the stored bonus to the Dex modifier and names both', () => {
        // Dex 12 → +1, stored bonus +5 → +6.
        render(<StatsBar character={withInitiative({ initiative: 5 })} />);
        expect(within(screen.getByTestId('stat-initiative')).getByText('+6')).toBeInTheDocument();
        const breakdown = screen.getByTestId('initiative-breakdown');
        expect(breakdown).toHaveTextContent('+1 dex');
        expect(breakdown).toHaveTextContent('+5 bonus');
        // Without this a healthy character renders "+0 exhaustion" and the
        // suite stays green.
        expect(breakdown).not.toHaveTextContent(/exhaustion/i);
      });

      it('names a negative bonus rather than hiding it', () => {
        render(<StatsBar character={withInitiative({ initiative: -2 })} />);
        expect(within(screen.getByTestId('stat-initiative')).getByText('-1')).toBeInTheDocument();
        // Typographic minus, not an ASCII hyphen: every sign on this line uses
        // one glyph so a negative bonus cannot sit above "−6 exhaustion" and
        // disagree with it (the rule StatusTracker states for its own line).
        expect(screen.getByTestId('initiative-breakdown')).toHaveTextContent('−2 bonus');
      });

      it('names exhaustion alongside the bonus when both apply', () => {
        // Dex +1, bonus +5, exhaustion 3 → −6, so +0.
        render(<StatsBar character={withInitiative({ initiative: 5, exhaustion: 3 })} />);
        expect(within(screen.getByTestId('stat-initiative')).getByText('+0')).toBeInTheDocument();
        const breakdown = screen.getByTestId('initiative-breakdown');
        expect(breakdown).toHaveTextContent('+5 bonus');
        expect(breakdown).toHaveTextContent('−6 exhaustion');
      });

      it('names exhaustion alone when there is no bonus to report', () => {
        // Dex +1, exhaustion 3 → −6, so −5. Without the dex line the reader
        // would see "-6 exhaustion" under a "-5" value and have to do the
        // subtraction themselves.
        render(<StatsBar character={withInitiative({ exhaustion: 3 })} />);
        expect(within(screen.getByTestId('stat-initiative')).getByText('-5')).toBeInTheDocument();
        const breakdown = screen.getByTestId('initiative-breakdown');
        expect(breakdown).toHaveTextContent('+1 dex');
        expect(breakdown).toHaveTextContent('−6 exhaustion');
        expect(breakdown).not.toHaveTextContent(/bonus/i);
      });

      it('derives from Dexterity alone when the column is null', () => {
        // The majority state: nothing writes the column unless a player edits
        // it. This is the shape that used to reach the tracker as +0.
        render(<StatsBar character={withInitiative({ initiative: null })} />);
        expect(within(screen.getByTestId('stat-initiative')).getByText('+1')).toBeInTheDocument();
        expect(screen.queryByTestId('initiative-breakdown')).toBeNull();
      });

      it('treats a stored 0 as no bonus, showing the bare Dex modifier', () => {
        render(<StatsBar character={withInitiative({ initiative: 0 })} />);
        expect(within(screen.getByTestId('stat-initiative')).getByText('+1')).toBeInTheDocument();
        expect(screen.queryByTestId('initiative-breakdown')).toBeNull();
      });

      // Version skew: a payload from a pre-VEG-452 backend carries a bare number
      // where the block now sits. Degrade to that number instead of rendering
      // "+undefined" or crashing the whole sheet, the same contract `speed` follows.
      it('renders a legacy numeric initiative rather than crashing', () => {
        const base = withInitiative();
        const legacy = {
          ...base,
          computed: { ...base.computed, initiative: 3 },
        } as unknown as Character;
        render(<StatsBar character={legacy} />);
        expect(within(screen.getByTestId('stat-initiative')).getByText('+3')).toBeInTheDocument();
        expect(screen.queryByTestId('initiative-breakdown')).toBeNull();
      });

      it('falls back to +0 when the computed initiative is absent entirely', () => {
        const base = withInitiative();
        const legacy = {
          ...base,
          computed: { ...base.computed, initiative: undefined },
        } as unknown as Character;
        render(<StatsBar character={legacy} />);
        expect(within(screen.getByTestId('stat-initiative')).getByText('+0')).toBeInTheDocument();
        expect(screen.queryByTestId('initiative-breakdown')).toBeNull();
      });
    });
  });

  describe('Speed', () => {
    it('renders speed with ft suffix', () => {
      render(<StatsBar character={mockCharacter} />);
      const block = screen.getByTestId('stat-speed');
      expect(within(block).getByText('25 ft')).toBeInTheDocument();
    });

    it('shows the reduced speed and the reduction while exhausted (VEG-449)', () => {
      // Base 25 ft, exhaustion 3 → −15 ft.
      const char = makeCharacter({ speed: 25, exhaustion: 3 });
      render(<StatsBar character={char} />);
      expect(within(screen.getByTestId('stat-speed')).getByText('10 ft (−15)')).toBeInTheDocument();
    });

    it('floors the displayed speed at 0 rather than going negative', () => {
      const char = makeCharacter({ speed: 25, exhaustion: 6 });
      render(<StatsBar character={char} />);
      expect(within(screen.getByTestId('stat-speed')).getByText('0 ft (−30)')).toBeInTheDocument();
    });

    // VEG-490. The big number stays compact (it renders at text-xl in a narrow
    // tile); the sources go beneath it, one per line, the way CombatBar's derived
    // AC already explains itself via `ac-breakdown`. One-per-line was chosen from
    // a real screenshot: joined into a sentence they wrapped mid-phrase in the
    // 3-column mobile grid, splitting "−10" from "encumbered".
    describe('penalty breakdown (VEG-490)', () => {
      // The shared fixture carries nothing by default, so weight is explicit
      // here. At 62 lb: STR 16 is unencumbered (encumbered above 80), STR 10
      // crosses the ×5 threshold (−10) and STR 6 the ×10 one (−20).
      const withStrength = (strength: number, over: Partial<Character> = {}) =>
        makeCharacter({
          abilityScores: {
            strength,
            dexterity: 12,
            constitution: 14,
            intelligence: 10,
            wisdom: 14,
            charisma: 8,
          },
          size: 'Small',
          speed: 25,
          inventory: [{ name: 'Anvil', quantity: 1, weight: 62, equipped: false }],
          ...over,
        });

      it('shows no breakdown when nothing is reducing speed', () => {
        render(<StatsBar character={withStrength(16)} />);
        expect(screen.queryByTestId('speed-breakdown')).toBeNull();
      });

      it('names exhaustion as the source when it is the only reduction', () => {
        render(<StatsBar character={withStrength(16, { exhaustion: 3 })} />);
        expect(screen.getByTestId('speed-breakdown')).toHaveTextContent('15 exhaustion');
        // /encumber/, not /encumbrance/ — the label is "encumbered", so the
        // narrower pattern would pass no matter what this rendered.
        expect(screen.getByTestId('speed-breakdown')).not.toHaveTextContent(/encumber/i);
      });

      it('reduces speed for encumbrance alone, which it previously ignored', () => {
        // The actual bug this ticket fixes: StatsBar rendered a flat 25 ft for an
        // encumbered character, while the inventory panel showed 15.
        render(<StatsBar character={withStrength(10)} />);
        expect(
          within(screen.getByTestId('stat-speed')).getByText('15 ft (−10)')
        ).toBeInTheDocument();
        expect(screen.getByTestId('speed-breakdown')).toHaveTextContent('10 encumbered');
      });

      it('names both sources when both apply, so the total is explainable', () => {
        // STR 6 → heavily encumbered (−20); exhaustion 2 → −10; base 25 → 0.
        render(<StatsBar character={withStrength(6, { exhaustion: 2 })} />);
        expect(
          within(screen.getByTestId('stat-speed')).getByText('0 ft (−30)')
        ).toBeInTheDocument();
        const breakdown = screen.getByTestId('speed-breakdown');
        expect(breakdown).toHaveTextContent('10 exhaustion');
        expect(breakdown).toHaveTextContent('20 encumbered');
      });

      // The branch speedBreakdown's own comment documents, and which nothing
      // reached: a pre-VEG-490 block has `penalty` but neither component field.
      // The skew test below exits at the `!speed` guard instead, so without this
      // the code could render "−undefined exhaustion" with a green suite.
      it('shows the total but no breakdown for a block predating the component fields', () => {
        const base = withStrength(16);
        const legacy = {
          ...base,
          computed: {
            ...base.computed,
            speed: { base: 30, penalty: 10, effective: 20 },
          },
        } as unknown as Character;
        render(<StatsBar character={legacy} />);
        expect(
          within(screen.getByTestId('stat-speed')).getByText('20 ft (−10)')
        ).toBeInTheDocument();
        expect(screen.queryByTestId('speed-breakdown')).toBeNull();
      });

      it('omits the breakdown under version skew rather than crashing', () => {
        const base = withStrength(16, { exhaustion: 3 });
        const legacy = {
          ...base,
          computed: {
            ...base.computed,
            speed: undefined as unknown as (typeof base)['computed']['speed'],
          },
        };
        render(<StatsBar character={legacy} />);
        expect(within(screen.getByTestId('stat-speed')).getByText('25 ft')).toBeInTheDocument();
        expect(screen.queryByTestId('speed-breakdown')).toBeNull();
      });
    });

    it('falls back to the stored column when computed.speed is absent (version skew)', () => {
      // A payload from a pre-VEG-449 backend has no `speed` in `computed`.
      // Degrade like CombatBar's derived AC does — never blank the sheet.
      const base = makeCharacter({ speed: 25 });
      const char = {
        ...base,
        computed: {
          ...base.computed,
          speed: undefined as unknown as (typeof base)['computed']['speed'],
        },
      };
      render(<StatsBar character={char} />);
      expect(within(screen.getByTestId('stat-speed')).getByText('25 ft')).toBeInTheDocument();
      // The rest of the bar still renders — the whole point of degrading.
      expect(screen.getByTestId('stat-prof-bonus')).toBeInTheDocument();
      expect(screen.getByTestId('stat-passive-perception')).toBeInTheDocument();
    });

    it('falls back to the default speed when both computed and stored are absent', () => {
      const base = makeCharacter({ speed: null });
      const char = {
        ...base,
        computed: {
          ...base.computed,
          speed: undefined as unknown as (typeof base)['computed']['speed'],
        },
      };
      render(<StatsBar character={char} />);
      expect(within(screen.getByTestId('stat-speed')).getByText('30 ft')).toBeInTheDocument();
    });

    it('reads the computed block, not the stored speed column (VEG-412)', () => {
      // Stored says 25; computed says 45 — computed must win, the same contract
      // the other readouts follow.
      const base = makeCharacter({ speed: 25 });
      const char = {
        ...base,
        computed: { ...base.computed, speed: { base: 45, penalty: 0, effective: 45 } },
      };
      render(<StatsBar character={char} />);
      expect(within(screen.getByTestId('stat-speed')).getByText('45 ft')).toBeInTheDocument();
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
      // WIS 14 → mod +2, no prof, 10 + 2 = 12. Built through the factory so
      // `computed` re-derives from the overridden skills list.
      const char = makeCharacter({
        abilityScores: mockCharacter.abilityScores,
        skills: ['Athletics'],
      });
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
    // Built through the factory so `computed` derives from the null scores the
    // way the backend would (all-10 defaults → +0), not from the old fixture's.
    const char = makeCharacter({ abilityScores: null, speed: null });
    render(<StatsBar character={char} />);
    expect(within(screen.getByTestId('stat-initiative')).getByText('+0')).toBeInTheDocument();
    expect(within(screen.getByTestId('stat-speed')).getByText('30 ft')).toBeInTheDocument();
  });
});

describe('computed block is the source of truth (VEG-412)', () => {
  // Force computed values that DISAGREE with what client math would derive from
  // the stored fields — the readouts must follow computed, proving the sheet no
  // longer recomputes ability math locally.
  const divergent = {
    ...mockCharacter,
    computed: {
      ...mockCharacter.computed,
      proficiencyBonus: 7,
      initiative: { base: 9, bonus: 0, exhaustionPenalty: 0, effective: 9 },
      passivePerception: 23,
    },
  };

  it('renders proficiency bonus from computed, not from level math', () => {
    // Level 5 would derive +3; computed says +7.
    render(<StatsBar character={divergent} />);
    expect(within(screen.getByTestId('stat-prof-bonus')).getByText('+7')).toBeInTheDocument();
  });

  it('renders initiative from computed, not from the Dex modifier', () => {
    // DEX 12 would derive +1; computed says +9.
    render(<StatsBar character={divergent} />);
    expect(within(screen.getByTestId('stat-initiative')).getByText('+9')).toBeInTheDocument();
  });

  it('renders passive perception from computed, not from Wis/prof math', () => {
    // WIS 14 + prof would derive 15; computed says 23.
    render(<StatsBar character={divergent} />);
    expect(
      within(screen.getByTestId('stat-passive-perception')).getByText('23')
    ).toBeInTheDocument();
  });
});

describe('exhaustion penalties reach the stat readouts (VEG-449)', () => {
  it('reduces initiative and passive perception by 2 per exhaustion level', () => {
    // Unexhausted baselines: DEX 12 → initiative +1; WIS 14 + prof 3 → PP 15.
    const char = makeCharacter({
      abilityScores: mockCharacter.abilityScores,
      skills: ['Perception', 'Athletics'],
      exhaustion: 2,
    });
    render(<StatsBar character={char} />);
    expect(within(screen.getByTestId('stat-initiative')).getByText('-3')).toBeInTheDocument();
    expect(
      within(screen.getByTestId('stat-passive-perception')).getByText('11')
    ).toBeInTheDocument();
  });

  it('leaves the proficiency bonus alone — it is not a d20 Test', () => {
    const char = makeCharacter({ exhaustion: 5 });
    render(<StatsBar character={char} />);
    expect(within(screen.getByTestId('stat-prof-bonus')).getByText('+3')).toBeInTheDocument();
  });

  it('rolls initiative with the penalized modifier', async () => {
    const user = userEvent.setup();
    mockMessage.mockReset();
    const char = makeCharacter({ abilityScores: mockCharacter.abilityScores, exhaustion: 2 });
    render(<StatsBar character={char} canRoll />);
    await user.click(screen.getByRole('button', { name: 'Roll initiative' }));

    // The d20 face is random, so assert the arithmetic rather than a literal
    // total: DEX 12 → +1, exhaustion 2 → −4, so the roll must apply −3.
    const message = mockMessage.mock.calls[0][0] as string;
    const [, face, total] = message.match(/Initiative: (\d+) . 3 = (-?\d+)/)!;
    expect(Number(total)).toBe(Number(face) - 3);
  });
});
