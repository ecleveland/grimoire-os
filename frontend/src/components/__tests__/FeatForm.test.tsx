import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import FeatForm from '../FeatForm';
import type { SrdFeat } from '@/lib/types';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const shieldMaster: SrdFeat = {
  id: 'hb-1',
  name: 'Shield Master',
  description: 'You use shields not just for protection but also for offense.',
  prerequisite: 'Level 4+',
  benefits: ['Shield Bash: You can shove with your shield.', 'Interpose: +2 to Dex saves.'],
  category: 'General',
  repeatable: true,
  source: 'Homebrew',
  contentSource: 'homebrew',
  createdById: 'u1',
};

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Lucky Dodge' } });
  fireEvent.change(screen.getByLabelText(/^Description/), {
    target: { value: 'You twist away from danger.' },
  });
}

describe('FeatForm', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefills fields from an initial feat', () => {
    render(
      <FeatForm
        initial={shieldMaster}
        submitting={false}
        submitLabel="Save"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Shield Master');
    expect(screen.getByLabelText(/^Category/)).toHaveValue('General');
    expect(screen.getByLabelText(/^Prerequisite/)).toHaveValue('Level 4+');
    expect(screen.getByLabelText(/Repeatable/)).toBeChecked();
    expect(screen.getByLabelText(/^Benefits/)).toHaveValue(
      'Shield Bash: You can shove with your shield.\nInterpose: +2 to Dex saves.'
    );
  });

  it('offers the canonical feat categories plus a none option', () => {
    render(
      <FeatForm submitting={false} submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />
    );

    const select = screen.getByLabelText(/^Category/);
    for (const category of ['Origin', 'General', 'Fighting Style', 'Epic Boon']) {
      expect(within(select).getByRole('option', { name: category })).toBeInTheDocument();
    }
  });

  it('submits a payload built from the form state', async () => {
    const user = userEvent.setup();
    render(
      <FeatForm submitting={false} submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />
    );

    fillRequired();
    fireEvent.change(screen.getByLabelText(/^Category/), { target: { value: 'Origin' } });
    fireEvent.change(screen.getByLabelText(/^Prerequisite/), { target: { value: 'Dex 13+' } });
    fireEvent.change(screen.getByLabelText(/^Benefits/), {
      target: { value: 'First benefit\nSecond benefit' },
    });
    await user.click(screen.getByLabelText(/Repeatable/));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(toast.error).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Lucky Dodge',
      description: 'You twist away from danger.',
      prerequisite: 'Dex 13+',
      benefits: ['First benefit', 'Second benefit'],
      category: 'Origin',
      repeatable: true,
    });
  });

  it('toasts the validation error and does not submit on invalid input', async () => {
    const user = userEvent.setup();
    render(
      <FeatForm submitting={false} submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />
    );

    fillRequired();
    fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: '   ' } });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/description/i));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables the submit button while submitting', () => {
    render(<FeatForm submitting submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />);

    expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
  });

  it('calls onCancel from the cancel button', async () => {
    const user = userEvent.setup();
    render(
      <FeatForm submitting={false} submitLabel="Create" onSubmit={onSubmit} onCancel={onCancel} />
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
  });
});
