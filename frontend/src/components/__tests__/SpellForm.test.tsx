import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import SpellForm from '../SpellForm';
import type { SrdSpell } from '@/lib/types';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const fireball: SrdSpell = {
  id: 'hb-1',
  name: 'Soul Bonfire',
  level: 3,
  school: 'Evocation',
  castingTime: '1 action',
  range: '150 feet',
  components: 'V, S, M',
  duration: 'Instantaneous',
  description: 'A bright streak flashes.',
  classes: ['Sorcerer', 'Wizard'],
  ritual: false,
  concentration: true,
  material: 'A tiny ball of bat guano',
  higherLevels: 'Damage increases by 1d6.',
  source: 'Homebrew',
  contentSource: 'homebrew',
  createdById: 'u1',
};

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Spark' } });
  fireEvent.change(screen.getByLabelText(/^Level/), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText(/^School/), { target: { value: 'Evocation' } });
  fireEvent.change(screen.getByLabelText(/Casting Time/), { target: { value: '1 action' } });
  fireEvent.change(screen.getByLabelText(/^Range/), { target: { value: 'Touch' } });
  fireEvent.change(screen.getByLabelText(/^Components/), { target: { value: 'V' } });
  fireEvent.change(screen.getByLabelText(/^Duration/), { target: { value: 'Instantaneous' } });
  fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: 'A small spark.' } });
}

describe('SpellForm', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefills fields from an initial spell', () => {
    render(
      <SpellForm
        initial={fireball}
        submitting={false}
        submitLabel="Save"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Soul Bonfire');
    expect(screen.getByLabelText(/^Level/)).toHaveValue('3');
    expect(screen.getByLabelText(/^School/)).toHaveValue('Evocation');
    expect(screen.getByLabelText(/^Classes/)).toHaveValue('Sorcerer, Wizard');
    expect(screen.getByLabelText(/Concentration/)).toBeChecked();
    expect(screen.getByLabelText(/Ritual/)).not.toBeChecked();
    expect(screen.getByLabelText(/Material/)).toHaveValue('A tiny ball of bat guano');
  });

  it('labels level 0 as Cantrip in the select', () => {
    render(
      <SpellForm submitting={false} submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />
    );

    const levelSelect = screen.getByLabelText(/^Level/);
    expect(within(levelSelect).getByRole('option', { name: /cantrip/i })).toBeInTheDocument();
  });

  it('submits a payload built from the form state', async () => {
    const user = userEvent.setup();
    render(
      <SpellForm submitting={false} submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />
    );

    fillRequired();
    fireEvent.change(screen.getByLabelText(/^Classes/), { target: { value: 'Bard, Cleric' } });
    await user.click(screen.getByLabelText(/Ritual/));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(toast.error).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Spark',
        level: 0,
        school: 'Evocation',
        castingTime: '1 action',
        range: 'Touch',
        components: 'V',
        duration: 'Instantaneous',
        description: 'A small spark.',
        classes: ['Bard', 'Cleric'],
        ritual: true,
        concentration: false,
        material: null,
        higherLevels: null,
      })
    );
  });

  it('toasts the validation error and does not submit on invalid input', async () => {
    const user = userEvent.setup();
    render(
      <SpellForm submitting={false} submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />
    );

    fillRequired();
    fireEvent.change(screen.getByLabelText(/^Range/), { target: { value: '   ' } });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/range/i));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables the submit button while submitting', () => {
    render(<SpellForm submitting submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />);

    expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
  });

  it('calls onCancel from the cancel button', async () => {
    const user = userEvent.setup();
    render(
      <SpellForm submitting={false} submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
  });
});
