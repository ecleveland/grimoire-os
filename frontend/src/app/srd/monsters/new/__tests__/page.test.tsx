import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import NewMonsterPage from '../page';

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
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Rat King' } });
  fireEvent.change(screen.getByLabelText(/^Size/), { target: { value: 'Medium' } });
  fireEvent.change(screen.getByLabelText(/^Type/), { target: { value: 'Beast' } });
  fireEvent.change(screen.getByLabelText(/Armor Class/), { target: { value: '12' } });
  fireEvent.change(screen.getByLabelText(/Hit Points/), { target: { value: '20' } });
  fireEvent.change(screen.getByLabelText(/^Speed/), { target: { value: '20 ft.' } });
  fireEvent.change(screen.getByLabelText(/Challenge Rating/), { target: { value: '1/2' } });
}

describe('NewMonsterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { userId: 'u1' } });
  });

  it('prompts unauthenticated visitors to sign in instead of rendering the form', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, user: null });

    render(<NewMonsterPage />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('creates the monster and redirects to the list', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({ id: 'hb-1', name: 'Rat King' });

    render(<NewMonsterPage />);
    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Create monster' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/srd/monsters',
        expect.objectContaining({ method: 'POST' })
      );
    });
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body).toEqual(
      expect.objectContaining({
        name: 'Rat King',
        size: 'Medium',
        type: 'Beast',
        armorClass: 12,
        hitPoints: 20,
        challengeRating: 0.5,
      })
    );
    expect(toast.success).toHaveBeenCalledWith('Monster created');
    expect(mockPush).toHaveBeenCalledWith('/srd/monsters');
  });

  it('toasts the API error message and stays on the page', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValue(new Error('You already have a monster with this name'));

    render(<NewMonsterPage />);
    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Create monster' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('You already have a monster with this name');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for non-Error rejections', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValue('boom');

    render(<NewMonsterPage />);
    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Create monster' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to create monster');
    });
  });
});
