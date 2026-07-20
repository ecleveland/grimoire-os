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

    // Re-entering the linked feat's exact name while options are still in
    // flight must keep the pick+option — the merge keeps it resolvable.
    const picker = screen.getByLabelText(/^Origin feat$/);
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

  it('drops the old feat’s option when the feat is retargeted to a different one', async () => {
    // Editing a background linked to Magic Initiate (Cleric): picking Alert
    // instead must not carry "Cleric" onto Alert — an option belongs to a feat.
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

    await user.click(screen.getByLabelText(/^Origin feat$/));
    await user.click(await screen.findByRole('option', { name: 'Alert' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ originFeatId: 'feat-alert', originFeatOption: null })
    );
  });

  // ── Structured skill/tool proficiencies (VEG-474) ──────────────────────
  it('selects canonical skills via the toggle group and submits them as an array', async () => {
    const user = userEvent.setup();
    renderForm();

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Gravedigger' } });
    await user.click(screen.getByRole('button', { name: 'Insight' }));
    await user.click(screen.getByRole('button', { name: 'Religion' }));
    await user.click(screen.getByRole('button', { name: 'Create background' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ skillProficiencies: ['Insight', 'Religion'] })
    );
  });

  it('deselecting a skill toggle removes it from the payload', async () => {
    const user = userEvent.setup();
    renderForm();

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Gravedigger' } });
    const insight = screen.getByRole('button', { name: 'Insight' });
    await user.click(insight); // select
    await user.click(insight); // deselect
    await user.click(screen.getByRole('button', { name: 'Create background' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ skillProficiencies: [] }));
  });

  it('pre-selects the current skills when editing an existing background', () => {
    const initial = {
      id: 'bg-1',
      name: 'Gravedigger',
      skillProficiencies: ['Insight'],
      toolProficiencies: ["Mason's Tools"],
      languages: 0,
      personalityTraits: [],
      ideals: [],
      bonds: [],
      flaws: [],
      originFeat: null,
      originFeatOption: null,
      source: 'Homebrew',
      contentSource: 'homebrew' as const,
      createdById: 'u1',
    };
    render(
      <BackgroundForm
        initial={initial}
        submitting={false}
        submitLabel="Save changes"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    );

    // The saved skill is toggled on; an unselected one is not.
    expect(screen.getByRole('button', { name: 'Insight' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Religion' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    // The saved tool round-trips as a removable chip.
    expect(screen.getByRole('button', { name: "Remove Mason's Tools" })).toBeInTheDocument();
  });

  it('adds an open-ended tool proficiency and submits it', async () => {
    const user = userEvent.setup();
    renderForm();

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Gravedigger' } });
    await user.type(screen.getByLabelText(/^Tool proficiencies$/), "Thieves' Tools{Enter}");
    await user.click(screen.getByRole('button', { name: 'Create background' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ toolProficiencies: ["Thieves' Tools"] })
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
