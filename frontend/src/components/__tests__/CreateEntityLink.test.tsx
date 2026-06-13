import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CreateEntityLink from '../CreateEntityLink';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

function setAuth(over: Record<string, unknown> = {}) {
  mockUseAuth.mockReturnValue({
    isAuthenticated: false,
    isLoading: false,
    likelyAuthenticated: false,
    ...over,
  });
}

describe('CreateEntityLink (VEG-339)', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('renders the real link for an authenticated user', () => {
    setAuth({ isAuthenticated: true });
    render(<CreateEntityLink href="/srd/monsters/new" label="Create monster" />);

    const link = screen.getByRole('link', { name: 'Create monster' });
    expect(link).toHaveAttribute('href', '/srd/monsters/new');
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
  });

  it('reserves space with a skeleton while hydrating a probable session', () => {
    setAuth({ isAuthenticated: false, isLoading: true, likelyAuthenticated: true });
    render(<CreateEntityLink href="/srd/monsters/new" label="Create monster" />);

    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders nothing for a settled anonymous visitor (no flash)', () => {
    setAuth({ isAuthenticated: false, isLoading: false, likelyAuthenticated: false });
    const { container } = render(
      <CreateEntityLink href="/srd/monsters/new" label="Create monster" />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('does not reserve space while hydrating without a session cookie', () => {
    // Anonymous visitor mid-hydration: likelyAuthenticated false → still nothing.
    setAuth({ isAuthenticated: false, isLoading: true, likelyAuthenticated: false });
    const { container } = render(
      <CreateEntityLink href="/srd/monsters/new" label="Create monster" />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
