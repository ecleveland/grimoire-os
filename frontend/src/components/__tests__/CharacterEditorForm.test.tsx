import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CharacterEditorForm, {
  characterFormPayload,
  characterToFormValues,
  emptyCharacterFormValues,
  type CharacterFormValues,
} from '../CharacterEditorForm';
import type { Character } from '@/lib/types';

function makeCharacter(over: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'Thora Ironfist',
    race: 'Dwarf',
    class: 'Fighter',
    subclass: 'Champion',
    level: 7,
    background: 'Soldier',
    alignment: 'Lawful Good',
    experiencePoints: 0,
    abilityScores: {
      strength: 16,
      dexterity: 12,
      constitution: 14,
      intelligence: 10,
      wisdom: 11,
      charisma: 9,
    },
    hitPoints: { max: 58, current: 41, temporary: 4 },
    deathSaves: { successes: 0, failures: 0 },
    armorClass: 18,
    speed: 25,
    initiative: 1,
    size: 'Medium',
    hitDice: { dieType: 'd10', total: 7, spent: 2 },
    proficiencies: [],
    languages: [],
    savingThrows: [],
    skills: [],
    spells: [],
    spellSlots: [],
    inventory: [],
    attunedItems: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    features: [],
    version: 3,
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

function renderForm(over: Partial<React.ComponentProps<typeof CharacterEditorForm>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <CharacterEditorForm
      initialValues={over.initialValues ?? emptyCharacterFormValues()}
      submitLabel={over.submitLabel ?? 'Create Character'}
      submitting={over.submitting ?? false}
      onSubmit={over.onSubmit ?? onSubmit}
      onCancel={over.onCancel ?? onCancel}
      identityExtra={over.identityExtra}
      footerExtra={over.footerExtra}
    />
  );
  return { onSubmit: over.onSubmit ?? onSubmit, onCancel: over.onCancel ?? onCancel };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pure helpers', () => {
  it('emptyCharacterFormValues returns SRD defaults', () => {
    const v = emptyCharacterFormValues();
    expect(v.size).toBe('Medium');
    expect(v.level).toBe(1);
    expect(v.hitDice).toEqual({ dieType: 'd8', total: 1, spent: 0 });
    expect(v.abilityScores.strength).toBe(10);
  });

  it('characterToFormValues maps a loaded character and fills slice-1 gaps', () => {
    const v = characterToFormValues(makeCharacter());
    expect(v).toMatchObject({
      name: 'Thora Ironfist',
      subclass: 'Champion',
      size: 'Medium',
      initiative: 1,
      hitDice: { dieType: 'd10', total: 7, spent: 2 },
      hitPoints: { max: 58, current: 41, temporary: 4 },
    });
  });

  it('characterToFormValues defaults size/initiative/hitDice when absent', () => {
    const v = characterToFormValues(
      makeCharacter({ size: undefined, initiative: undefined, hitDice: undefined, level: 5 })
    );
    expect(v.size).toBe('Medium');
    expect(v.initiative).toBe(0);
    // Hit-dice total seeds from level when the character has none recorded.
    expect(v.hitDice).toEqual({ dieType: 'd8', total: 5, spent: 0 });
  });

  it('characterToFormValues coerces null-ish optional strings to empty strings', () => {
    const v = characterToFormValues(
      makeCharacter({
        race: undefined,
        class: undefined,
        background: undefined,
        alignment: undefined,
      })
    );
    expect(v.race).toBe('');
    expect(v.class).toBe('');
    expect(v.background).toBe('');
    expect(v.alignment).toBe('');
  });

  it('characterFormPayload includes every slice-1 field and omits id/version', () => {
    const payload = characterFormPayload(characterToFormValues(makeCharacter()));
    expect(payload).toMatchObject({
      name: 'Thora Ironfist',
      race: 'Dwarf',
      class: 'Fighter',
      subclass: 'Champion',
      level: 7,
      background: 'Soldier',
      alignment: 'Lawful Good',
      size: 'Medium',
      armorClass: 18,
      initiative: 1,
      speed: 25,
      hitPoints: { max: 58, current: 41, temporary: 4 },
      hitDice: { dieType: 'd10', total: 7, spent: 2 },
    });
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('version');
  });
});

describe('CharacterEditorForm rendering', () => {
  it('prefills every section from initialValues', () => {
    renderForm({ initialValues: characterToFormValues(makeCharacter()) });

    expect((screen.getByLabelText(/^name/i) as HTMLInputElement).value).toBe('Thora Ironfist');
    expect((screen.getByLabelText(/^subclass/i) as HTMLInputElement).value).toBe('Champion');
    expect((screen.getByLabelText(/^size/i) as HTMLSelectElement).value).toBe('Medium');
    // Ability scores carry aria-labels (STR/DEX/...).
    expect((screen.getByLabelText('STR') as HTMLInputElement).value).toBe('16');
    expect((screen.getByLabelText('CHA') as HTMLInputElement).value).toBe('9');
    expect((screen.getByLabelText(/initiative/i) as HTMLInputElement).value).toBe('1');
    expect((screen.getByLabelText(/temp hp/i) as HTMLInputElement).value).toBe('4');
    expect((screen.getByLabelText(/hit die$/i) as HTMLSelectElement).value).toBe('d10');
    expect((screen.getByLabelText(/hit dice total/i) as HTMLInputElement).value).toBe('7');
    expect((screen.getByLabelText(/hit dice spent/i) as HTMLInputElement).value).toBe('2');
  });

  it('renders the provided submit label and extra slots', () => {
    renderForm({
      submitLabel: 'Save Changes',
      identityExtra: <div>identity-extra-slot</div>,
      footerExtra: <button type="button">Delete</button>,
    });
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    expect(screen.getByText('identity-extra-slot')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('disables submit while submitting', () => {
    renderForm({ submitting: true });
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });
});

describe('CharacterEditorForm interactions', () => {
  it('submits the edited values, including the new slice-1 fields', async () => {
    const onSubmit = vi.fn();
    renderForm({ initialValues: characterToFormValues(makeCharacter()), onSubmit });
    const user = userEvent.setup();

    const nameInput = screen.getByLabelText(/^name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Hero');
    await user.selectOptions(screen.getByLabelText(/^size/i), 'Large');
    await user.selectOptions(screen.getByLabelText(/hit die$/i), 'd12');
    // Atomic set: number handlers run per keystroke, so set the value in one shot.
    fireEvent.change(screen.getByLabelText(/initiative/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/hit dice spent/i), { target: { value: '5' } });

    await user.click(screen.getByRole('button', { name: /create character/i }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0] as CharacterFormValues;
    expect(submitted).toMatchObject({
      name: 'Renamed Hero',
      size: 'Large',
      initiative: 3,
      hitDice: { dieType: 'd12', total: 7, spent: 5 },
    });
  });

  it('updates a single ability score without disturbing the others', async () => {
    const onSubmit = vi.fn();
    renderForm({ initialValues: characterToFormValues(makeCharacter()), onSubmit });
    const user = userEvent.setup();

    fireEvent.change(screen.getByLabelText('STR'), { target: { value: '20' } });
    await user.click(screen.getByRole('button', { name: /create character/i }));

    const submitted = onSubmit.mock.calls[0][0] as CharacterFormValues;
    expect(submitted.abilityScores).toEqual({
      strength: 20,
      dexterity: 12,
      constitution: 14,
      intelligence: 10,
      wisdom: 11,
      charisma: 9,
    });
  });

  it('calls onCancel without submitting', async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    renderForm({ onSubmit, onCancel });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
