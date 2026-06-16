import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import ClassStep from '../ClassStep';
import {
  emptyCharacterFormValues,
  type CharacterFormValues,
} from '@/components/CharacterEditorForm';
import type { SrdClass, SrdSubclass } from '@/lib/types';

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
    skillChoices: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Perception', 'Survival'],
    toolProficiencies: [],
    numSkillChoices: 2,
    features: [],
    subclassLevel: 3,
    source: 'SRD',
    ...over,
  };
}

const WIZARD = makeClass({
  id: 'wizard',
  name: 'Wizard',
  hitDie: 'd6',
  savingThrows: ['Intelligence', 'Wisdom'],
  armorProficiencies: [],
  weaponProficiencies: ['Daggers'],
  skillChoices: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'],
  numSkillChoices: 2,
  spellcasting: { ability: 'Intelligence' },
  subclassLevel: 2,
});

const CLERIC = makeClass({
  id: 'cleric',
  name: 'Cleric',
  hitDie: 'd8',
  savingThrows: ['Wisdom', 'Charisma'],
  armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
  skillChoices: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'],
  numSkillChoices: 2,
  spellcasting: { ability: 'Wisdom' },
  subclassLevel: 1,
});

const SUBCLASSES: SrdSubclass[] = [
  { id: 'life', name: 'Life Domain', classId: 'cleric', source: 'SRD' },
  { id: 'light', name: 'Light Domain', classId: 'cleric', source: 'SRD' },
];

function routeApiFetch(classes: SrdClass[], subclasses: SrdSubclass[] = []) {
  mockApiFetch.mockImplementation((path?: string) => {
    if (path === '/srd/classes') return Promise.resolve(classes);
    if (typeof path === 'string' && path.startsWith('/srd/subclasses'))
      return Promise.resolve(subclasses);
    return Promise.resolve([]);
  });
}

// Stateful harness: ClassStep is controlled, so we hold the draft and forward
// onChange, and capture the latest reported validity.
function Harness({ onValid }: { onValid: (valid: boolean) => void }) {
  const [draft, setDraft] = useState<CharacterFormValues>(() => emptyCharacterFormValues());
  return (
    <ClassStep
      value={draft}
      onChange={patch => setDraft(d => ({ ...d, ...patch }))}
      onValidChange={onValid}
    />
  );
}

function renderStep(classes: SrdClass[], subclasses: SrdSubclass[] = []) {
  routeApiFetch(classes, subclasses);
  const onValid = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<Harness onValid={onValid} />, { wrapper });
  return { onValid };
}

async function pickClass(user: ReturnType<typeof userEvent.setup>, name: string) {
  // Type to (re)open + filter the combobox, then pick the option. Clicking an
  // already-focused input doesn't re-fire focus, so typing is the reliable open.
  const input = screen.getByRole('combobox', { name: /^class/i });
  await user.clear(input);
  await user.type(input, name);
  await user.click(await screen.findByRole('option', { name }));
}

beforeEach(() => mockApiFetch.mockReset());

describe('ClassStep — SRD class selection', () => {
  it('populates hit die, saving throws, and proficiencies when a class is selected', async () => {
    const user = userEvent.setup();
    renderStep([makeClass()]);

    await pickClass(user, 'Fighter');

    const summary = await screen.findByRole('group', { name: /class grants/i });
    expect(within(summary).getByText(/d10/)).toBeInTheDocument();
    expect(within(summary).getByText(/Strength/)).toBeInTheDocument();
    expect(within(summary).getByText(/Constitution/)).toBeInTheDocument();
    // Armor phrases normalize to the canonical toggles.
    expect(within(summary).getByText(/Heavy/)).toBeInTheDocument();
    expect(within(summary).getByText(/Martial weapons/)).toBeInTheDocument();
  });

  it('requires exactly numSkillChoices skill picks before the step is valid', async () => {
    const user = userEvent.setup();
    const { onValid } = renderStep([makeClass()]);

    await pickClass(user, 'Fighter');
    // Class chosen but 0 of 2 skills → invalid.
    expect(onValid).toHaveBeenLastCalledWith(false);

    const skills = await screen.findByRole('group', { name: /skills/i });
    await user.click(within(skills).getByRole('button', { name: /athletics/i }));
    expect(onValid).toHaveBeenLastCalledWith(false); // 1 of 2
    await user.click(within(skills).getByRole('button', { name: /acrobatics/i }));
    expect(onValid).toHaveBeenLastCalledWith(true); // 2 of 2

    // A third pick is capped — selection stays at 2 and the step stays valid.
    await user.click(within(skills).getByRole('button', { name: /history/i }));
    expect(within(skills).getByRole('button', { name: /history/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(onValid).toHaveBeenLastCalledWith(true);
  });

  it('records the spellcasting ability for a caster and clears it for a martial class', async () => {
    const user = userEvent.setup();
    renderStep([WIZARD, makeClass()]);

    await pickClass(user, 'Wizard');
    const summary = await screen.findByRole('group', { name: /class grants/i });
    expect(within(summary).getByText(/spellcaster \(intelligence\)/i)).toBeInTheDocument();

    // Switching to a non-caster clears the spellcasting record.
    await pickClass(user, 'Fighter');
    const summary2 = await screen.findByRole('group', { name: /class grants/i });
    expect(within(summary2).queryByText(/spellcaster/i)).toBeNull();
  });

  it('shows the subclass picker only when the class chooses its subclass at level 1', async () => {
    const user = userEvent.setup();
    renderStep([CLERIC, makeClass()], SUBCLASSES);

    await pickClass(user, 'Cleric');
    expect(await screen.findByLabelText(/subclass/i)).toBeInTheDocument();

    // Fighter chooses its subclass at level 3 → no picker yet.
    await pickClass(user, 'Fighter');
    expect(screen.queryByLabelText(/subclass/i)).toBeNull();
  });
});
