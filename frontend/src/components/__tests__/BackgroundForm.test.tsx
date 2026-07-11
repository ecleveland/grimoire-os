import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BackgroundForm from '@/components/BackgroundForm';

const mockUseApiQuery = vi.fn();
vi.mock('@/lib/query', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/query')>()),
  useApiQuery: (path: string) => mockUseApiQuery(path),
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
    mockUseApiQuery.mockReturnValue({
      data: { data: FEATS },
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

  it('feeds the origin-feat picker from the credentialed feat list (SRD + own homebrew)', () => {
    renderForm();

    expect(mockUseApiQuery).toHaveBeenCalledWith('/srd/feats?limit=100');
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
