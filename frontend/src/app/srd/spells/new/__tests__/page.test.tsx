import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import NewSpellPage from '../page';

const mockApiFetch = vi.fn();
const mockUseAuth = vi.fn();
const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Spark' } });
  fireEvent.change(screen.getByLabelText(/^School/), { target: { value: 'Evocation' } });
  fireEvent.change(screen.getByLabelText(/Casting Time/), { target: { value: '1 action' } });
  fireEvent.change(screen.getByLabelText(/^Range/), { target: { value: 'Touch' } });
  fireEvent.change(screen.getByLabelText(/^Components/), { target: { value: 'V' } });
  fireEvent.change(screen.getByLabelText(/^Duration/), { target: { value: 'Instantaneous' } });
  fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: 'A small spark.' } });
}

describe('NewSpellPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { userId: 'u1' } });
  });

  it('prompts unauthenticated visitors to sign in instead of rendering the form', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, user: null });

    render(<NewSpellPage />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('creates the spell and redirects to the list', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({ id: 'hb-1', name: 'Spark' });

    render(<NewSpellPage />);
    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Create spell' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/srd/spells',
        expect.objectContaining({ method: 'POST' })
      );
    });
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body).toEqual(
      expect.objectContaining({
        name: 'Spark',
        level: 0,
        school: 'Evocation',
        castingTime: '1 action',
        range: 'Touch',
        components: 'V',
        duration: 'Instantaneous',
        description: 'A small spark.',
        material: null,
        higherLevels: null,
      })
    );
    expect(toast.success).toHaveBeenCalledWith('Spell created');
    expect(mockPush).toHaveBeenCalledWith('/srd/spells');
  });

  it('toasts the API error message and stays on the page', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValue(new Error('You already have a spell with this name'));

    render(<NewSpellPage />);
    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Create spell' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('You already have a spell with this name');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for non-Error rejections', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValue('boom');

    render(<NewSpellPage />);
    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Create spell' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to create spell');
    });
  });
});
