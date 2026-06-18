import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import ClassStep from '../ClassStep';
import { DraftProvider, useCharacterDraft } from '../../useCharacterDraft';
import type { GrantRegistry } from '../../grants';
import type { CharacterFormValues } from '@/components/CharacterEditorForm';
import type { SrdClass, SrdSubclass } from '@/lib/types';

type Seed = { base?: Partial<CharacterFormValues>; grants?: GrantRegistry };

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

// Stateful harness: ClassStep is controlled and reads the grant registry from
// context, so we drive the real useCharacterDraft hook (the production store) and
// wrap in DraftProvider — tests then exercise the real compile/reconcile path.
function Harness({ onValid, seed }: { onValid: (valid: boolean) => void; seed?: Seed }) {
  const api = useCharacterDraft(seed);
  return (
    <DraftProvider api={api}>
      <ClassStep value={api.draft} onChange={api.onChange} onValidChange={onValid} />
      {/* Readouts so tests can assert draft writes/resets directly. */}
      <div data-testid="draft-skills">{api.draft.skills.join(',')}</div>
      <div data-testid="draft-subclass">{api.draft.subclass}</div>
      <div data-testid="draft-spell">{api.draft.spellcastingAbility}</div>
    </DraftProvider>
  );
}

function renderStep(classes: SrdClass[], subclasses: SrdSubclass[] = [], seed?: Seed) {
  routeApiFetch(classes, subclasses);
  const onValid = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  render(<Harness onValid={onValid} seed={seed} />, { wrapper });
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

async function pickSubclass(user: ReturnType<typeof userEvent.setup>, name: string) {
  const input = screen.getByRole('combobox', { name: /subclass/i });
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

  it('applies the class grants when the name is typed exactly, not only when clicked', async () => {
    const user = userEvent.setup();
    renderStep([makeClass()]);

    // Type the full name and commit by tabbing away — never click an option.
    await user.type(screen.getByRole('combobox', { name: /^class/i }), 'Fighter');
    await user.tab();

    const summary = await screen.findByRole('group', { name: /class grants/i });
    await waitFor(() => expect(within(summary).getByText(/d10/)).toBeInTheDocument());
    expect(within(summary).getByText(/Martial weapons/)).toBeInTheDocument();
  });

  it('drops stale grants when the class name is edited away from an SRD class', async () => {
    const user = userEvent.setup();
    renderStep([WIZARD]);

    await pickClass(user, 'Wizard');
    await waitFor(() =>
      expect(screen.getByTestId('draft-spell')).toHaveTextContent('Intelligence')
    );

    // Edit the committed name into a non-matching custom value.
    await user.type(screen.getByRole('combobox', { name: /^class/i }), 'x');
    await waitFor(() => expect(screen.getByTestId('draft-spell')).toHaveTextContent(''));
    expect(screen.queryByRole('group', { name: /class grants/i })).toBeNull();
  });

  it('resets picked skills and subclass when the class is switched', async () => {
    const user = userEvent.setup();
    const { onValid } = renderStep([CLERIC, WIZARD], SUBCLASSES);

    await pickClass(user, 'Cleric');
    // History + Insight are in BOTH the Cleric and Wizard pools, so a count that
    // survives the switch would prove a (buggy) merge instead of a reset.
    const skills = await screen.findByRole('group', { name: /skills/i });
    await user.click(within(skills).getByRole('button', { name: /history/i }));
    await user.click(within(skills).getByRole('button', { name: /insight/i }));
    await pickSubclass(user, 'Life Domain');
    expect(onValid).toHaveBeenLastCalledWith(true);
    expect(screen.getByTestId('draft-subclass')).toHaveTextContent('Life Domain');

    await pickClass(user, 'Wizard');
    // Skills and subclass were wiped for the new class.
    await waitFor(() => expect(onValid).toHaveBeenLastCalledWith(false));
    expect(screen.getByTestId('draft-skills')).toHaveTextContent('');
    expect(screen.getByTestId('draft-subclass')).toHaveTextContent('');
  });

  it('keeps a deselected class skill that a background still grants, drops a class-exclusive one', async () => {
    const user = userEvent.setup();
    // A background already granted Insight (seeded as the 'background' slice).
    renderStep([makeClass()], [], { grants: { background: { skills: ['Insight'] } } });

    await pickClass(user, 'Fighter');
    const skills = await screen.findByRole('group', { name: /skills/i });
    // Pick Insight (also a background grant) and Athletics (class-exclusive).
    await user.click(within(skills).getByRole('button', { name: /^insight$/i }));
    await user.click(within(skills).getByRole('button', { name: /^athletics$/i }));
    await waitFor(() => expect(screen.getByTestId('draft-skills')).toHaveTextContent('Athletics'));

    // Deselect both class picks.
    await user.click(within(skills).getByRole('button', { name: /^insight$/i }));
    await user.click(within(skills).getByRole('button', { name: /^athletics$/i }));

    // Athletics (class-only) is gone; Insight survives via the background slice.
    await waitFor(() =>
      expect(screen.getByTestId('draft-skills')).not.toHaveTextContent('Athletics')
    );
    expect(screen.getByTestId('draft-skills')).toHaveTextContent('Insight');
  });

  it('re-resets the skill picks when returning to a previously chosen class (A→B→A)', async () => {
    const user = userEvent.setup();
    const { onValid } = renderStep([CLERIC, WIZARD]);

    await pickClass(user, 'Cleric');
    const skills = await screen.findByRole('group', { name: /skills/i });
    await user.click(within(skills).getByRole('button', { name: /history/i }));
    await user.click(within(skills).getByRole('button', { name: /insight/i }));
    expect(onValid).toHaveBeenLastCalledWith(true);

    await pickClass(user, 'Wizard');
    await waitFor(() => expect(screen.getByTestId('draft-skills')).toHaveTextContent(''));

    // Returning to Cleric re-applies its empty skill slice — the prior picks are
    // not resurrected (the identity guard sees cleric≠wizard and re-resets).
    await pickClass(user, 'Cleric');
    await waitFor(() => expect(onValid).toHaveBeenLastCalledWith(false));
    expect(screen.getByTestId('draft-skills')).toHaveTextContent('');
  });

  it('records the selected subclass name on the draft', async () => {
    const user = userEvent.setup();
    renderStep([CLERIC], SUBCLASSES);

    await pickClass(user, 'Cleric');
    await pickSubclass(user, 'Life Domain');
    expect(screen.getByTestId('draft-subclass')).toHaveTextContent('Life Domain');
  });

  it('treats an unrecognized class name as a valid custom class with no skill gate or grants', async () => {
    const user = userEvent.setup();
    const { onValid } = renderStep([makeClass()]);

    await user.type(screen.getByRole('combobox', { name: /^class/i }), 'Homebrewmancer');
    // No SRD match → no grants summary, no skill pool, and the skill-count rule
    // is trivially satisfied (the shell still gates on the class-name being set).
    await waitFor(() => expect(onValid).toHaveBeenLastCalledWith(true));
    expect(screen.queryByRole('group', { name: /class grants/i })).toBeNull();
    expect(screen.queryByRole('group', { name: /skills/i })).toBeNull();
    expect(screen.getByTestId('draft-spell')).toHaveTextContent('');
  });
});
