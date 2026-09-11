import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { toast } from 'sonner';
import ClassForm from '@/components/ClassForm';
import type { SrdClass } from '@/lib/types';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const NOTE_TAIL = "This form doesn't edit them yet, and saving keeps them as they are.";

function makeClass(over: Partial<SrdClass> = {}): SrdClass {
  return {
    id: 'cls-hb',
    name: 'Warden',
    hitDie: 'd10',
    description: 'A sworn protector of wild places.',
    primaryAbilities: ['Strength', 'Wisdom'],
    savingThrows: ['Strength', 'Constitution'],
    skillChoices: ['Athletics', 'Nature', 'Survival'],
    numSkillChoices: 2,
    armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
    weaponProficiencies: ['Simple weapons', 'Martial weapons'],
    toolProficiencies: ['Herbalism Kit'],
    subclassLevel: 3,
    features: [
      { id: 'cf-1', name: 'Wardens Bond', level: 1, description: 'A bond.' },
      { id: 'cf-2', name: 'Grove Step', level: 4 },
    ],
    multiclassing: {
      prerequisites: [{ ability: 'Wisdom', minimum: 13 }],
      proficienciesGained: ['Shields'],
      casterType: null,
    },
    source: 'Homebrew',
    contentSource: 'homebrew',
    createdById: 'u1',
    ...over,
  };
}

function hitDieOptions(): string[] {
  return within(screen.getByLabelText('Hit die'))
    .getAllByRole('option')
    .map(o => (o as HTMLOptionElement).value);
}

function inputValues(label: string): string[] {
  return screen.getAllByLabelText(label).map(el => (el as HTMLInputElement).value);
}

describe('ClassForm', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderForm(props: Partial<ComponentProps<typeof ClassForm>> = {}) {
    return render(
      <ClassForm
        submitting={false}
        submitLabel="Create class"
        onSubmit={onSubmit}
        onCancel={onCancel}
        {...props}
      />
    );
  }

  it('offers exactly the five hit dice on a new class, starting on d8, with no rules note (VEG-508)', () => {
    renderForm();

    expect(hitDieOptions()).toEqual(['d4', 'd6', 'd8', 'd10', 'd12']);
    expect(screen.getByLabelText('Hit die')).toHaveValue('d8');
    expect(screen.queryByText(/This form doesn't edit them yet/)).not.toBeInTheDocument();
  });

  it('prefills every control from the class being edited', () => {
    renderForm({ initial: makeClass(), submitLabel: 'Save changes' });

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Warden');
    expect(screen.getByLabelText('Hit die')).toHaveValue('d10');
    expect(screen.getByLabelText('Description')).toHaveValue('A sworn protector of wild places.');

    // Both ability groups have a Strength chip, so every chip check is scoped to its group.
    const primary = within(screen.getByRole('group', { name: 'Primary abilities' }));
    expect(primary.getByRole('button', { name: 'Strength' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(primary.getByRole('button', { name: 'Wisdom' })).toHaveAttribute('aria-pressed', 'true');
    expect(primary.getByRole('button', { name: 'Constitution' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    const saves = within(screen.getByRole('group', { name: 'Saving throws' }));
    expect(saves.getByRole('button', { name: 'Constitution' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(saves.getByRole('button', { name: 'Wisdom' })).toHaveAttribute('aria-pressed', 'false');
    const skills = within(screen.getByRole('group', { name: 'Skill choices' }));
    expect(skills.getByRole('button', { name: 'Survival' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(skills.getByRole('button', { name: 'Stealth' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByLabelText('Number of skill choices')).toHaveValue(2);

    expect(screen.getByRole('button', { name: 'Remove Medium armor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Martial weapons' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Herbalism Kit' })).toBeInTheDocument();
    expect(screen.getByLabelText('Subclass level')).toHaveValue(3);
    expect(inputValues('Feature name')).toEqual(['Wardens Bond', 'Grove Step']);
    expect(inputValues('Feature level')).toEqual(['1', '4']);
  });

  it('keeps a stored d20 hit die on offer after switching away from it', async () => {
    const user = userEvent.setup();
    renderForm({ initial: makeClass({ hitDie: 'd20' }), submitLabel: 'Save changes' });

    expect(screen.getByLabelText('Hit die')).toHaveValue('d20');
    await user.selectOptions(screen.getByLabelText('Hit die'), 'd10');

    expect(screen.getByLabelText('Hit die')).toHaveValue('d10');
    expect(hitDieOptions()).toEqual(['d4', 'd6', 'd8', 'd10', 'd12', 'd20']);
  });

  describe('note about rules the form does not edit', () => {
    it('names only multiclassing when that is the only one set', () => {
      renderForm({ initial: makeClass() });

      expect(
        screen.getByText(`This class also has multiclassing rules. ${NOTE_TAIL}`)
      ).toBeInTheDocument();
    });

    it('joins two with "and"', () => {
      renderForm({ initial: makeClass({ spellcasting: { ability: 'Wisdom' } }) });

      expect(
        screen.getByText(`This class also has spellcasting and multiclassing rules. ${NOTE_TAIL}`)
      ).toBeInTheDocument();
    });

    it('names all three, in order, when all three are set', () => {
      renderForm({
        initial: makeClass({
          spellcasting: { ability: 'Wisdom' },
          equipmentChoices: { choices: [] },
        }),
      });

      expect(
        screen.getByText(
          `This class also has spellcasting, starting equipment and multiclassing rules. ${NOTE_TAIL}`
        )
      ).toBeInTheDocument();
    });

    it('is absent when none are set, including the nulls the API sends', () => {
      const none = { spellcasting: null, equipmentChoices: null, multiclassing: null };
      renderForm({ initial: makeClass(none as unknown as Partial<SrdClass>) });

      expect(screen.queryByText(/This form doesn't edit them yet/)).not.toBeInTheDocument();
    });
  });

  it('submits the edited class as the exact payload', async () => {
    const user = userEvent.setup();
    renderForm({ initial: makeClass(), submitLabel: 'Save changes' });

    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Keeps the old roads.' },
    });
    await user.click(
      within(screen.getByRole('group', { name: 'Saving throws' })).getByRole('button', {
        name: 'Wisdom',
      })
    );
    await user.type(screen.getByLabelText('Armor proficiencies'), 'Heavy armor{Enter}');
    await user.type(screen.getByLabelText('Weapon proficiencies'), 'Longbows{Enter}');
    await user.type(screen.getByLabelText('Tool proficiencies'), "Cartographer's Tools{Enter}");
    fireEvent.change(screen.getByLabelText('Subclass level'), { target: { value: '5' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      name: 'Warden',
      hitDie: 'd10',
      description: 'Keeps the old roads.',
      primaryAbilities: ['Strength', 'Wisdom'],
      savingThrows: ['Strength', 'Constitution', 'Wisdom'],
      skillChoices: ['Athletics', 'Nature', 'Survival'],
      numSkillChoices: 2,
      armorProficiencies: ['Light armor', 'Medium armor', 'Shields', 'Heavy armor'],
      weaponProficiencies: ['Simple weapons', 'Martial weapons', 'Longbows'],
      toolProficiencies: ['Herbalism Kit', "Cartographer's Tools"],
      subclassLevel: 5,
      features: [
        { name: 'Wardens Bond', level: 1, description: 'A bond.' },
        { name: 'Grove Step', level: 4, description: '' },
      ],
    });
  });

  it('saves a description-only edit of a class whose stored skill count exceeds its empty pool (VEG-508)', async () => {
    const user = userEvent.setup();
    renderForm({
      initial: makeClass({ numSkillChoices: 2, skillChoices: [] }),
      submitLabel: 'Save changes',
    });

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Fixed a typo.' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(toast.error).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      name: 'Warden',
      hitDie: 'd10',
      description: 'Fixed a typo.',
      primaryAbilities: ['Strength', 'Wisdom'],
      savingThrows: ['Strength', 'Constitution'],
      skillChoices: [],
      numSkillChoices: 2,
      armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
      weaponProficiencies: ['Simple weapons', 'Martial weapons'],
      toolProficiencies: ['Herbalism Kit'],
      subclassLevel: 3,
      features: [
        { name: 'Wardens Bond', level: 1, description: 'A bond.' },
        { name: 'Grove Step', level: 4, description: '' },
      ],
    });
  });

  it('toasts a validation failure and does not submit', async () => {
    const user = userEvent.setup();
    renderForm({ initial: makeClass(), submitLabel: 'Save changes' });

    // Changing the count is what brings the pool rule into play for a loaded class.
    fireEvent.change(screen.getByLabelText('Number of skill choices'), { target: { value: '5' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(toast.error).toHaveBeenCalledWith(
      "Number of skill choices can't be more than the skills offered (3)"
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables the submit button and shows Saving... while submitting', () => {
    renderForm({ submitting: true });

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Create class' })).not.toBeInTheDocument();
  });

  it('calls onCancel from the cancel button without submitting', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
