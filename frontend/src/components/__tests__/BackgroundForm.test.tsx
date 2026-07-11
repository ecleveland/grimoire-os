import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BackgroundForm from '@/components/BackgroundForm';

const mockUseApiQueryAll = vi.fn();
vi.mock('@/lib/query', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/query')>()),
  useApiQueryAll: (path: string) => mockUseApiQueryAll(path),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const FEATS = [
  { id: 'feat-alert', name: 'Alert' },
  { id: 'feat-mi', name: 'Magic Initiate' },
];

describe('BackgroundForm', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApiQueryAll.mockReturnValue({
      data: FEATS,
      isLoading: false,
      isError: false,
    });
  });

  function renderForm() {
    return render(
      <BackgroundForm
        submitting={false}
        submitLabel="Create background"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );
  }

  it('feeds the origin-feat picker every page of the credentialed feat list (SRD + own homebrew)', () => {
    renderForm();

    expect(mockUseApiQueryAll).toHaveBeenCalledWith('/srd/feats?limit=100');
  });

  it('keeps a prefilled origin feat pickable while the feat list is still loading', async () => {
    // One keystroke during load must not invalidate a legitimate saved link
    // (the fetched options are empty until the query resolves).
    mockUseApiQueryAll.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    const initial = {
      id: 'bg-1',
      name: 'Gravedigger',
      skillProficiencies: [],
      toolProficiencies: [],
      languages: 0,
      personalityTraits: [],
      ideals: [],
      bonds: [],
      flaws: [],
      originFeat: { id: 'feat-mi', name: 'Magic Initiate' },
      originFeatOption: 'Cleric',
      source: 'Homebrew',
      contentSource: 'homebrew' as const,
      createdById: 'u1',
    };
    const user = userEvent.setup();
    render(
      <BackgroundForm
        initial={initial}
        submitting={false}
        submitLabel="Save changes"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    // Re-type the linked feat's name while options are still in flight.
    const picker = screen.getByLabelText(/^Origin feat$/);
    fireEvent.change(picker, { target: { value: 'Magic Initiat' } });
    fireEvent.change(picker, { target: { value: 'Magic Initiate' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ originFeatId: 'feat-mi', originFeatOption: 'Cleric' })
    );
  });

  it('submits the picked feat id, not just its display name', async () => {
    const user = userEvent.setup();
    renderForm();

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Gravedigger' } });
    await user.click(screen.getByLabelText(/^Origin feat$/));
    await user.click(await screen.findByRole('option', { name: 'Alert' }));
    fireEvent.change(screen.getByLabelText(/Origin feat option/), {
      target: { value: 'Cleric' },
    });
    await user.click(screen.getByRole('button', { name: 'Create background' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Gravedigger',
        originFeatId: 'feat-alert',
        originFeatOption: 'Cleric',
      })
    );
  });

  it('clears a stale pick when the typed name no longer matches it', async () => {
    const user = userEvent.setup();
    renderForm();

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Gravedigger' } });
    await user.click(screen.getByLabelText(/^Origin feat$/));
    await user.click(await screen.findByRole('option', { name: 'Alert' }));
    // Editing the text after the pick invalidates the id; clearing it entirely
    // submits no origin feat at all.
    fireEvent.change(screen.getByLabelText(/^Origin feat$/), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: 'Create background' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ originFeatId: null, originFeatOption: null })
    );
  });

  it('invokes onCancel from the cancel button', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
