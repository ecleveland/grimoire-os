import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomePage from '../page';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

function setAuth(over: Record<string, unknown> = {}) {
  mockUseAuth.mockReturnValue({
    user: null,
    isLoading: false,
    likelyAuthenticated: false,
    ...over,
  });
}

describe('HomePage (VEG-339)', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('greets an authenticated user by display name', () => {
    setAuth({
      user: { userId: 'u1', username: 'gandalf', role: 'player', displayName: 'Gandalf' },
    });
    render(<HomePage />);
    expect(screen.getByRole('heading', { name: /Welcome, Gandalf/ })).toBeInTheDocument();
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
  });

  it('reserves the name with a skeleton while a probable session hydrates', () => {
    setAuth({ user: null, isLoading: true, likelyAuthenticated: true });
    render(<HomePage />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('shows no name skeleton for a settled anonymous visitor', () => {
    setAuth({ user: null, isLoading: false, likelyAuthenticated: false });
    render(<HomePage />);
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
    // The static dashboard tiles still render.
    expect(screen.getByRole('heading', { name: 'Campaigns' })).toBeInTheDocument();
  });
});
