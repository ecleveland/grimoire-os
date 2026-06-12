import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import MonsterForm from '../MonsterForm';
import type { SrdMonster } from '@/lib/types';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const troll: SrdMonster = {
  id: 'hb-1',
  name: 'Cave Troll',
  size: 'Large',
  type: 'Giant',
  alignment: 'chaotic evil',
  armorClass: 15,
  hitPoints: 84,
  speed: '30 ft.',
  str: 18,
  dex: 13,
  con: 20,
  int: 7,
  wis: 9,
  cha: 7,
  damageResistances: ['cold'],
  damageImmunities: [],
  damageVulnerabilities: [],
  conditionImmunities: [],
  challengeRating: 5,
  actions: [{ name: 'Slam', description: '+7 to hit.' }],
  source: 'Homebrew',
  contentSource: 'homebrew',
  createdById: 'u1',
};

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Rat King' } });
  fireEvent.change(screen.getByLabelText(/^Size/), { target: { value: 'Medium' } });
  fireEvent.change(screen.getByLabelText(/^Type/), { target: { value: 'Beast' } });
  fireEvent.change(screen.getByLabelText(/Armor Class/), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText(/Hit Points/), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText(/^Speed/), { target: { value: '20 ft.' } });
  fireEvent.change(screen.getByLabelText(/Challenge Rating/), { target: { value: '1/2' } });
}

describe('MonsterForm', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefills fields from an initial monster', () => {
    render(
      <MonsterForm
        initial={troll}
        submitting={false}
        submitLabel="Save"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Cave Troll');
    expect(screen.getByLabelText(/Armor Class/)).toHaveValue('15');
    expect(screen.getByLabelText(/Challenge Rating/)).toHaveValue('5');
    expect(screen.getByLabelText(/Action name/)).toHaveValue('Slam');
  });

  it('submits a payload built from the form state', async () => {
    const user = userEvent.setup();
    render(
      <MonsterForm
        submitting={false}
        submitLabel="Create"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(toast.error).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Rat King',
        size: 'Medium',
        type: 'Beast',
        armorClass: 12,
        hitPoints: 20,
        speed: '20 ft.',
        challengeRating: 0.5,
        actions: [],
      })
    );
  });

  it('adds and includes an action row in the payload', async () => {
    const user = userEvent.setup();
    render(
      <MonsterForm
        submitting={false}
        submitLabel="Create"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Add action' }));
    fireEvent.change(screen.getByLabelText(/Action name/), { target: { value: 'Bite' } });
    fireEvent.change(screen.getByLabelText(/Action description/), {
      target: { value: 'Chomp chomp.' },
    });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: [{ name: 'Bite', description: 'Chomp chomp.' }],
      })
    );
  });

  it('removes an action row', async () => {
    const user = userEvent.setup();
    render(
      <MonsterForm
        initial={troll}
        submitting={false}
        submitLabel="Save"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole('button', { name: /Remove action 1/i }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ actions: [] }));
  });

  it('toasts the validation error and does not submit on invalid input', async () => {
    const user = userEvent.setup();
    render(
      <MonsterForm
        submitting={false}
        submitLabel="Create"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    fillRequired();
    fireEvent.change(screen.getByLabelText(/Armor Class/), { target: { value: 'heavy' } });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/armor class/i));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables the submit button while submitting', () => {
    render(<MonsterForm submitting submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />);

    expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
  });

  it('calls onCancel from the cancel button', async () => {
    const user = userEvent.setup();
    render(
      <MonsterForm
        submitting={false}
        submitLabel="Create"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
  });
});
