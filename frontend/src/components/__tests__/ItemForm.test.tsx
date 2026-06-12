import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import ItemForm from '../ItemForm';
import type { SrdItem } from '@/lib/types';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const cloak: SrdItem = {
  id: 'hb-1',
  name: 'Cloak of Whispers',
  category: 'Wondrous Item',
  cost: '500 gp',
  weight: 2.5 as unknown as string,
  description: 'A cloak woven from twilight that muffles every footstep.',
  properties: ['Finesse', 'Light'],
  rarity: 'Rare',
  requiresAttunement: true,
  isMagic: true,
  source: 'Homebrew',
  contentSource: 'homebrew',
  createdById: 'u1',
};

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Lucky Coin' } });
  fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: 'Wondrous Item' } });
}

describe('ItemForm', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefills fields from an initial item', () => {
    render(
      <ItemForm
        initial={cloak}
        submitting={false}
        submitLabel="Save"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Cloak of Whispers');
    expect(screen.getByLabelText(/^Category/)).toHaveValue('Wondrous Item');
    expect(screen.getByLabelText(/^Rarity/)).toHaveValue('Rare');
    expect(screen.getByLabelText(/^Cost/)).toHaveValue('500 gp');
    expect(screen.getByLabelText(/^Weight/)).toHaveValue('2.5');
    expect(screen.getByLabelText(/^Properties/)).toHaveValue('Finesse, Light');
    expect(screen.getByLabelText(/^Description/)).toHaveValue(
      'A cloak woven from twilight that muffles every footstep.'
    );
    expect(screen.getByLabelText(/Requires attunement/)).toBeChecked();
    expect(screen.getByLabelText(/Magic item/)).toBeChecked();
    expect(screen.getByLabelText(/Stealth disadvantage/)).not.toBeChecked();
  });

  it('offers the canonical categories and rarities plus a none option for rarity', () => {
    render(
      <ItemForm submitting={false} submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />
    );

    const category = screen.getByLabelText(/^Category/);
    for (const c of ['Wondrous Item', 'Potion', 'Ring', 'Adventuring Gear']) {
      expect(within(category).getByRole('option', { name: c })).toBeInTheDocument();
    }
    const rarity = screen.getByLabelText(/^Rarity/);
    for (const r of ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact']) {
      expect(within(rarity).getByRole('option', { name: r })).toBeInTheDocument();
    }
    expect(within(rarity).getByRole('option', { name: '— none —' })).toBeInTheDocument();
  });

  it('submits a payload built from the form state', async () => {
    const user = userEvent.setup();
    render(
      <ItemForm submitting={false} submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />
    );

    fillRequired();
    fireEvent.change(screen.getByLabelText(/^Rarity/), { target: { value: 'Uncommon' } });
    fireEvent.change(screen.getByLabelText(/^Cost/), { target: { value: '50 gp' } });
    fireEvent.change(screen.getByLabelText(/^Weight/), { target: { value: '0.5' } });
    fireEvent.change(screen.getByLabelText(/^Properties/), {
      target: { value: 'Shiny, Small' },
    });
    fireEvent.change(screen.getByLabelText(/^Description/), {
      target: { value: 'A coin that always lands on edge.' },
    });
    await user.click(screen.getByLabelText(/Magic item/));
    await user.click(screen.getByLabelText(/Requires attunement/));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(toast.error).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Lucky Coin',
      category: 'Wondrous Item',
      rarity: 'Uncommon',
      cost: '50 gp',
      weight: 0.5,
      damage: null,
      damageType: null,
      armorClass: null,
      strengthRequirement: null,
      properties: ['Shiny', 'Small'],
      description: 'A coin that always lands on edge.',
      requiresAttunement: true,
      isMagic: true,
      stealthDisadvantage: false,
    });
  });

  it('toasts the validation error and does not submit on invalid input', async () => {
    const user = userEvent.setup();
    render(
      <ItemForm submitting={false} submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />
    );

    fillRequired();
    fireEvent.change(screen.getByLabelText(/^Weight/), { target: { value: 'heavy' } });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/weight/i));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables the submit button while submitting', () => {
    render(<ItemForm submitting submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />);

    expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
  });

  it('calls onCancel from the cancel button', async () => {
    const user = userEvent.setup();
    render(
      <ItemForm submitting={false} submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
  });
});
