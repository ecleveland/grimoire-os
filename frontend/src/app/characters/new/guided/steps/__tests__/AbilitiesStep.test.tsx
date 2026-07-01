import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import AbilitiesStep from '../AbilitiesStep';
import {
  emptyCharacterFormValues,
  type CharacterFormValues,
} from '@/components/CharacterEditorForm';
import type { SrdClass } from '@/lib/types';

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

function makeClass(over: Partial<SrdClass> = {}): SrdClass {
  return {
    id: 'fighter',
    name: 'Fighter',
    hitDie: 'd10',
    primaryAbilities: ['Strength'],
    savingThrows: ['Strength', 'Constitution'],
    armorProficiencies: ['All armor', 'Shields'],
    weaponProficiencies: ['Simple weapons', 'Martial weapons'],
    skillChoices: ['Acrobatics', 'Athletics'],
    toolProficiencies: [],
    numSkillChoices: 2,
    features: [],
    source: 'SRD',
    ...over,
  };
}

const MONK = makeClass({
  id: 'monk',
  name: 'Monk',
  hitDie: 'd8',
  primaryAbilities: ['Dexterity', 'Wisdom'],
});

function Harness({ initial }: { initial?: Partial<CharacterFormValues> }) {
  const [draft, setDraft] = useState<CharacterFormValues>(() => ({
    ...emptyCharacterFormValues(),
    ...initial,
  }));
  return (
    <>
      <AbilitiesStep value={draft} onChange={patch => setDraft(d => ({ ...d, ...patch }))} />
      <div data-testid="scores">
        {`${draft.abilityScores.strength},${draft.abilityScores.dexterity},${draft.abilityScores.constitution},${draft.abilityScores.intelligence},${draft.abilityScores.wisdom},${draft.abilityScores.charisma}`}
      </div>
    </>
  );
}

function renderStep(initial?: Partial<CharacterFormValues>, classes: SrdClass[] = []) {
  mockApiFetch.mockImplementation((path?: string) => {
    if (path === '/srd/classes') return Promise.resolve(classes);
    return Promise.resolve([]);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<Harness initial={initial} />, { wrapper });
}

const scores = () => screen.getByTestId('scores').textContent;

describe('AbilitiesStep — ability score generation', () => {
  it('manual mode: editing a score updates the draft and the previewed modifier', () => {
    renderStep();
    // Manual is the default mode.
    const str = screen.getByRole('spinbutton', { name: 'STR' });
    fireEvent.change(str, { target: { value: '16' } });

    expect(scores()).toBe('16,10,10,10,10,10');
    // Preview modifier reflects the new score: (16-10)/2 = +3.
    expect(screen.getByTestId('mod-strength')).toHaveTextContent('+3');
  });

  it('point-buy: starts at all 8 with a 27-point budget and enforces the 8–15 bounds', async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole('radio', { name: /point buy/i }));

    expect(scores()).toBe('8,8,8,8,8,8');
    expect(screen.getByTestId('points-remaining')).toHaveTextContent('27');

    const incStr = screen.getByRole('button', { name: /increase strength/i });
    const decStr = screen.getByRole('button', { name: /decrease strength/i });
    expect(decStr).toBeDisabled(); // already at the floor of 8

    // 8 → 15 costs 9 points; raises the bound ceiling.
    for (let i = 0; i < 7; i++) await user.click(incStr);
    expect(screen.getByTestId('score-strength')).toHaveTextContent('15');
    expect(screen.getByTestId('points-remaining')).toHaveTextContent('18');
    expect(incStr).toBeDisabled(); // can't exceed 15
  });

  it('point-buy: decrementing refunds points and re-disables at the floor', async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole('radio', { name: /point buy/i }));

    const incStr = screen.getByRole('button', { name: /increase strength/i });
    const decStr = screen.getByRole('button', { name: /decrease strength/i });
    await user.click(incStr); // 8 → 9 (cost 1)
    await user.click(incStr); // 9 → 10 (cost 1)
    expect(screen.getByTestId('score-strength')).toHaveTextContent('10');
    expect(screen.getByTestId('points-remaining')).toHaveTextContent('25');

    await user.click(decStr); // 10 → 9, refund 1
    await user.click(decStr); // 9 → 8, refund 1
    expect(screen.getByTestId('score-strength')).toHaveTextContent('8');
    expect(screen.getByTestId('points-remaining')).toHaveTextContent('27');
    expect(decStr).toBeDisabled();
  });

  it('point-buy: blocks an increment that would exceed the budget', async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole('radio', { name: /point buy/i }));

    // Spend the full 27 on three 15s (9 each).
    for (const ability of ['strength', 'dexterity', 'constitution']) {
      const inc = screen.getByRole('button', { name: new RegExp(`increase ${ability}`, 'i') });
      for (let i = 0; i < 7; i++) await user.click(inc);
    }
    expect(screen.getByTestId('points-remaining')).toHaveTextContent('0');
    // With nothing left, a fourth ability can't be raised at all.
    expect(screen.getByRole('button', { name: /increase intelligence/i })).toBeDisabled();
  });

  it('standard array: assigns each value once and cannot reuse a value', async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole('radio', { name: /standard array/i }));

    // Assign 15 to STR; it should disappear from the other abilities' options.
    await user.selectOptions(screen.getByRole('combobox', { name: 'STR' }), '15');
    const dexOptions = within(screen.getByRole('combobox', { name: 'DEX' }))
      .getAllByRole('option')
      .map(o => (o as HTMLOptionElement).value);
    expect(dexOptions).not.toContain('15');

    // Completing the assignment writes the six scores to the draft.
    await user.selectOptions(screen.getByRole('combobox', { name: 'DEX' }), '14');
    await user.selectOptions(screen.getByRole('combobox', { name: 'CON' }), '13');
    await user.selectOptions(screen.getByRole('combobox', { name: 'INT' }), '12');
    await user.selectOptions(screen.getByRole('combobox', { name: 'WIS' }), '10');
    await user.selectOptions(screen.getByRole('combobox', { name: 'CHA' }), '8');
    expect(scores()).toBe('15,14,13,12,10,8');
  });

  it('standard array: re-assigning an ability frees its previous value for others', async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole('radio', { name: /standard array/i }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'STR' }), '15');
    await user.selectOptions(screen.getByRole('combobox', { name: 'DEX' }), '14');
    // Change STR off 15 → 15 returns to the pool for the others.
    await user.selectOptions(screen.getByRole('combobox', { name: 'STR' }), '13');
    const dexValues = within(screen.getByRole('combobox', { name: 'DEX' }))
      .getAllByRole('option')
      .map(o => (o as HTMLOptionElement).value);
    expect(dexValues).toContain('15');
  });

  it('standard array: clearing a slot after completion drops the stale score', async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole('radio', { name: /standard array/i }));

    const order: [string, string][] = [
      ['STR', '15'],
      ['DEX', '14'],
      ['CON', '13'],
      ['INT', '12'],
      ['WIS', '10'],
      ['CHA', '8'],
    ];
    for (const [ability, val] of order) {
      await user.selectOptions(screen.getByRole('combobox', { name: ability }), val);
    }
    expect(scores()).toBe('15,14,13,12,10,8');

    // De-selecting STR must not leave the stale 15 in the draft.
    await user.selectOptions(screen.getByRole('combobox', { name: 'STR' }), '');
    expect(scores()).toBe('10,14,13,12,10,8');
  });

  it('manual: truncates, clamps, and ignores empty/invalid input', () => {
    renderStep();
    const str = screen.getByRole('spinbutton', { name: 'STR' });

    fireEvent.change(str, { target: { value: '13.7' } });
    expect(scores()).toBe('13,10,10,10,10,10'); // truncated
    fireEvent.change(str, { target: { value: '99' } });
    expect(scores()).toBe('30,10,10,10,10,10'); // clamped up to 30
    fireEvent.change(str, { target: { value: '0' } });
    expect(scores()).toBe('1,10,10,10,10,10'); // clamped up to 1
    fireEvent.change(str, { target: { value: '' } });
    expect(scores()).toBe('1,10,10,10,10,10'); // empty is a no-op, not 0/1 churn
    fireEvent.change(str, { target: { value: 'abc' } });
    expect(scores()).toBe('1,10,10,10,10,10'); // non-numeric ignored
  });

  it('carries the point-buy result into manual mode for fine-tuning', async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getByRole('radio', { name: /point buy/i }));
    const incStr = screen.getByRole('button', { name: /increase strength/i });
    await user.click(incStr);
    await user.click(incStr); // STR 8 → 10

    await user.click(screen.getByRole('radio', { name: /manual/i }));
    expect(screen.getByRole('spinbutton', { name: 'STR' })).toHaveValue(10);
  });

  it('shows persisted scores without mutating them on (re)mount', () => {
    // Simulates returning to the step: the draft already holds final scores.
    renderStep({
      abilityScores: {
        strength: 15,
        dexterity: 14,
        constitution: 13,
        intelligence: 12,
        wisdom: 10,
        charisma: 8,
      },
    });
    expect(scores()).toBe('15,14,13,12,10,8');
    expect(screen.getByTestId('mod-strength')).toHaveTextContent('+2');
  });

  it('computed preview reflects proficiency bonus and proficient save/skill bonuses', () => {
    renderStep({
      level: 5, // proficiency bonus +3
      abilityScores: {
        strength: 16,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 14,
        charisma: 10,
      },
      savingThrows: ['Strength'],
      skills: ['Athletics'],
    });

    expect(screen.getByTestId('prof-bonus')).toHaveTextContent('+3');
    // STR save is proficient: mod +3 + prof +3 = +6.
    expect(screen.getByTestId('save-strength')).toHaveTextContent('+6');
    // WIS save is not proficient: just the +2 modifier.
    expect(screen.getByTestId('save-wisdom')).toHaveTextContent('+2');
    // Athletics (STR, proficient): +3 + 3 = +6.
    expect(screen.getByTestId('skill-athletics')).toHaveTextContent('+6');
  });
});

describe('AbilitiesStep — recommended primary abilities (VEG-447)', () => {
  it('summarizes the selected class’s recommended abilities', async () => {
    renderStep({ class: 'Fighter' }, [makeClass()]);
    const summary = await screen.findByTestId('recommended-summary');
    expect(summary).toHaveTextContent('Recommended for Fighter: Strength');
  });

  it('marks the recommended ability row in each method UI', async () => {
    renderStep({ class: 'Fighter' }, [makeClass()]);
    const user = userEvent.setup();
    await screen.findByTestId('recommended-summary');
    // Manual (default): the STR field's label carries a tag; DEX's doesn't.
    const labelOf = (name: string) =>
      screen.getByRole('spinbutton', { name }).closest('label') as HTMLElement;
    expect(within(labelOf('STR')).queryByTestId('recommended-tag')).toBeInTheDocument();
    expect(within(labelOf('DEX')).queryByTestId('recommended-tag')).not.toBeInTheDocument();

    // Point-buy and standard-array modes both surface exactly one tag (STR).
    await user.click(screen.getByRole('radio', { name: /point buy/i }));
    expect(screen.getAllByTestId('recommended-tag')).toHaveLength(1);
    await user.click(screen.getByRole('radio', { name: /standard array/i }));
    expect(screen.getAllByTestId('recommended-tag')).toHaveLength(1);
  });

  it('highlights every primary for a multi-primary class (Monk → Dex + Wis)', async () => {
    renderStep({ class: 'Monk' }, [MONK]);
    const summary = await screen.findByTestId('recommended-summary');
    expect(summary).toHaveTextContent('Recommended for Monk: Dexterity, Wisdom');
    // Two tags in the default manual grid — DEX and WIS, not STR.
    expect(screen.getAllByTestId('recommended-tag')).toHaveLength(2);
    const labelOf = (name: string) =>
      screen.getByRole('spinbutton', { name }).closest('label') as HTMLElement;
    expect(within(labelOf('DEX')).queryByTestId('recommended-tag')).toBeInTheDocument();
    expect(within(labelOf('WIS')).queryByTestId('recommended-tag')).toBeInTheDocument();
    expect(within(labelOf('STR')).queryByTestId('recommended-tag')).not.toBeInTheDocument();
  });

  it('shows nothing when no class is selected', () => {
    renderStep({ class: '' }, [makeClass()]);
    expect(screen.queryByTestId('recommended-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recommended-tag')).not.toBeInTheDocument();
  });

  it('shows nothing for a free-typed/homebrew class with no SRD match', async () => {
    renderStep({ class: 'Artificer' }, [makeClass()]);
    // Let the class query resolve so this isn't just asserting a loading gap.
    await screen.findByText('Abilities');
    expect(screen.queryByTestId('recommended-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recommended-tag')).not.toBeInTheDocument();
  });
});
