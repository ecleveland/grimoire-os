import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Header from '../Header';

const mockUseAuth = vi.fn();
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

function setAuth(over: Record<string, unknown> = {}) {
  mockUseAuth.mockReturnValue({
    isAuthenticated: false,
    isLoading: false,
    likelyAuthenticated: false,
    user: null,
    isAdmin: false,
    logout: vi.fn(),
    ...over,
  });
}

describe('Header (VEG-339)', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('renders nothing for a settled anonymous visitor', () => {
    setAuth({ isAuthenticated: false, isLoading: false, likelyAuthenticated: false });
    const { container } = render(<Header />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while hydrating without a session cookie (no flash on public pages)', () => {
    setAuth({ isAuthenticated: false, isLoading: true, likelyAuthenticated: false });
    const { container } = render(<Header />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the full nav with the display name for an authenticated user', () => {
    setAuth({
      isAuthenticated: true,
      user: { userId: 'u1', username: 'gandalf', role: 'player', displayName: 'Gandalf' },
    });
    render(<Header />);

    expect(screen.getByRole('link', { name: 'GrimoireOS' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Campaigns' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gandalf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Logout' })).toBeInTheDocument();
    expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument();
  });

  it('shows the Admin link only for admins', () => {
    setAuth({
      isAuthenticated: true,
      isAdmin: true,
      user: { userId: 'a1', username: 'root', role: 'admin' },
    });
    render(<Header />);
    // Desktop + mobile nav both render the Admin link.
    expect(screen.getAllByRole('link', { name: 'Admin' }).length).toBeGreaterThan(0);
  });

  it('omits the Admin link for non-admins', () => {
    setAuth({
      isAuthenticated: true,
      isAdmin: false,
      user: { userId: 'u1', username: 'player', role: 'player' },
    });
    render(<Header />);
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('reserves the bar with a skeleton username while hydrating a probable session', () => {
    setAuth({
      isAuthenticated: false,
      isLoading: true,
      likelyAuthenticated: true,
      user: null,
    });
    render(<Header />);

    // The bar (brand + static nav links) is present so it occupies its height...
    expect(screen.getByRole('link', { name: 'GrimoireOS' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Campaigns' })).toBeInTheDocument();
    // ...and the unknown username is a skeleton placeholder, not empty text.
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });
});
