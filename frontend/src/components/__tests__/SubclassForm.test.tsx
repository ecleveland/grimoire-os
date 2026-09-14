import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { toast } from 'sonner';
import SubclassForm from '@/components/SubclassForm';
import type { SrdSubclass } from '@/lib/types';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

function makeSubclass(over: Partial<SrdSubclass> = {}): SrdSubclass {
  return {
    id: 'sc-hb',
    name: 'Deadeye',
    classId: 'cls-hb',
    description: 'A patient marksman.',
    features: [{ id: 'cf-1', name: 'Steady Aim', level: 3, description: 'Hold the shot.' }],
    source: 'Homebrew',
    contentSource: 'homebrew',
    createdById: 'u1',
    ...over,
  };
}

describe('SubclassForm', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderForm(props: Partial<ComponentProps<typeof SubclassForm>> = {}) {
    return render(
      <SubclassForm
        submitting={false}
        submitLabel="Create subclass"
        onSubmit={onSubmit}
        onCancel={onCancel}
        {...props}
      />
    );
  }

  it('starts blank with no features on a new subclass', () => {
    renderForm();

    expect(screen.getByLabelText(/^Name/)).toHaveValue('');
    expect(screen.getByLabelText('Description')).toHaveValue('');
    expect(screen.queryByLabelText('Feature name')).not.toBeInTheDocument();
  });

  it('prefills every control from the subclass being edited', () => {
    renderForm({ initial: makeSubclass(), submitLabel: 'Save changes' });

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Deadeye');
    expect(screen.getByLabelText('Description')).toHaveValue('A patient marksman.');
    expect(screen.getByLabelText('Feature name')).toHaveValue('Steady Aim');
    expect(screen.getByLabelText('Feature level')).toHaveValue(3);
    expect(screen.getByLabelText('Feature description')).toHaveValue('Hold the shot.');
  });

  it('submits a new subclass as the exact payload', async () => {
    const user = userEvent.setup();
    renderForm();

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Deadeye' } });
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'A patient marksman.' },
    });
    await user.click(screen.getByRole('button', { name: 'Create subclass' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      name: 'Deadeye',
      description: 'A patient marksman.',
      features: [],
    });
  });

  it('sends the whole feature list when one is added', async () => {
    const user = userEvent.setup();
    renderForm({ initial: makeSubclass(), submitLabel: 'Save changes' });

    await user.click(screen.getByRole('button', { name: '+ Add feature' }));
    fireEvent.change(screen.getAllByLabelText('Feature name')[1], {
      target: { value: 'Long Watch' },
    });
    fireEvent.change(screen.getAllByLabelText('Feature level')[1], { target: { value: '7' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onSubmit.mock.calls[0][0].features).toEqual([
      { name: 'Steady Aim', level: 3, description: 'Hold the shot.' },
      { name: 'Long Watch', level: 7, description: '' },
    ]);
  });

  it('leaves features out of a description-only edit', async () => {
    const user = userEvent.setup();
    renderForm({ initial: makeSubclass(), submitLabel: 'Save changes' });

    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Fixed a typo.' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    // Strict, so a `features` key fails it whatever its value.
    expect(onSubmit.mock.calls[0][0]).toStrictEqual({
      name: 'Deadeye',
      description: 'Fixed a typo.',
    });
  });

  // The Name field is `required`, so an empty box never reaches the handler.
  // A box holding only spaces satisfies the browser and fails the trim rule.
  it('toasts a whitespace-only name and does not submit', async () => {
    const user = userEvent.setup();
    renderForm();

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: '   ' } });
    await user.click(screen.getByRole('button', { name: 'Create subclass' }));

    expect(toast.error).toHaveBeenCalledWith('Name is required');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('toasts a feature validation failure and does not submit', async () => {
    const user = userEvent.setup();
    renderForm({ initial: makeSubclass(), submitLabel: 'Save changes' });

    await user.click(screen.getByRole('button', { name: '+ Add feature' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(toast.error).toHaveBeenCalledWith('Every feature needs a name');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('disables the submit button and shows Saving... while submitting', () => {
    renderForm({ submitting: true });

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Create subclass' })).not.toBeInTheDocument();
  });

  it('calls onCancel from the cancel button without submitting', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps editing the subclass it loaded when a refetch replaces the prop', () => {
    const { rerender } = renderForm({ initial: makeSubclass(), submitLabel: 'Save changes' });

    // The class page keeps its query mounted, so a background refetch hands the
    // form a new `initial` while the author is still editing the old one.
    rerender(
      <SubclassForm
        initial={makeSubclass({ name: 'Sharpshooter' })}
        submitting={false}
        submitLabel="Save changes"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Deadeye');
  });
});
