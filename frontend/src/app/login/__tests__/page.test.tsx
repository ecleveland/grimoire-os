import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../page';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockLogin = vi.fn();
const mockReplace = vi.fn();
let mockIsAuthenticated = false;
let mockIsLoading = false;

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    login: mockLogin,
    isAuthenticated: mockIsAuthenticated,
    isLoading: mockIsLoading,
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Labels in the source don't use htmlFor, so getByLabelText won't work.
 *  Find the input inside the same parent div as the label text. */
function getInput(labelText: RegExp): HTMLInputElement {
  const label = screen.getByText(labelText);
  return label.parentElement!.querySelector('input')! as HTMLInputElement;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LoginPage', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockReplace.mockReset();
    mockIsAuthenticated = false;
    mockIsLoading = false;
    window.history.replaceState({}, '', '/login');
  });

  describe('signed-in visitor', () => {
    it('renders the form and stays put when not signed in', () => {
      render(<LoginPage />);
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('waits while the session is still loading', () => {
      mockIsLoading = true;
      mockIsAuthenticated = true;
      render(<LoginPage />);
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('replaces the page with next once signed in', () => {
      mockIsAuthenticated = true;
      window.history.replaceState({}, '', '/login?next=%2Fcampaigns%2F1');
      render(<LoginPage />);
      expect(mockReplace).toHaveBeenCalledWith('/campaigns/1');
    });

    it('replaces the page with / when there is no next', () => {
      mockIsAuthenticated = true;
      render(<LoginPage />);
      expect(mockReplace).toHaveBeenCalledWith('/');
    });

    it('replaces the page with / when next leaves the site', () => {
      mockIsAuthenticated = true;
      window.history.replaceState({}, '', '/login?next=https%3A%2F%2Fevil.com');
      render(<LoginPage />);
      expect(mockReplace).toHaveBeenCalledWith('/');
    });
  });

  describe('rendering', () => {
    it('renders the heading "Sign in to GrimoireOS"', () => {
      render(<LoginPage />);
      expect(screen.getByRole('heading', { name: /sign in to grimoireos/i })).toBeInTheDocument();
    });

    it('renders username input with required attribute', () => {
      render(<LoginPage />);
      expect(getInput(/^Username$/)).toBeRequired();
    });

    it('renders password input with type="password" and required', () => {
      render(<LoginPage />);
      const input = getInput(/^Password$/);
      expect(input).toHaveAttribute('type', 'password');
      expect(input).toBeRequired();
    });

    it('renders submit button with text "Sign in"', () => {
      render(<LoginPage />);
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    });

    it('renders link to /register', () => {
      render(<LoginPage />);
      const link = screen.getByRole('link', { name: /register/i });
      expect(link).toHaveAttribute('href', '/register');
    });
  });

  describe('form submission - happy path', () => {
    it('calls login with username and password values on submit', async () => {
      mockLogin.mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(getInput(/^Username$/), 'myuser');
      await user.type(getInput(/^Password$/), 'mypassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('myuser', 'mypassword', null);
      });
    });

    it('shows "Signing in..." on the button while loading', async () => {
      mockLogin.mockImplementation(() => new Promise(() => {}));
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(getInput(/^Username$/), 'user');
      await user.type(getInput(/^Password$/), 'password');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByRole('button')).toHaveTextContent('Signing in...');
        expect(screen.getByRole('button')).toBeDisabled();
      });
    });

    it('re-enables the button after login completes', async () => {
      mockLogin.mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(getInput(/^Username$/), 'user');
      await user.type(getInput(/^Password$/), 'password');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByRole('button')).toHaveTextContent('Sign in');
        expect(screen.getByRole('button')).not.toBeDisabled();
      });
    });
  });

  describe('next param', () => {
    it('passes next through to login', async () => {
      window.history.replaceState({}, '', '/login?next=%2Fcampaigns%2F1');
      mockLogin.mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(getInput(/^Username$/), 'myuser');
      await user.type(getInput(/^Password$/), 'mypassword');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith('myuser', 'mypassword', '/campaigns/1');
      });
    });

    it('carries next onto the register link', () => {
      window.history.replaceState({}, '', '/login?next=%2Fcampaigns%2F1');
      render(<LoginPage />);
      const link = screen.getByRole('link', { name: /register/i });
      expect(link).toHaveAttribute('href', '/register?next=%2Fcampaigns%2F1');
    });
  });

  describe('form submission - error handling', () => {
    it('displays error message when login throws an Error', async () => {
      mockLogin.mockRejectedValue(new Error('Invalid credentials'));
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(getInput(/^Username$/), 'bad');
      await user.type(getInput(/^Password$/), 'creds');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });
    });

    it('displays "Login failed" when login throws a non-Error', async () => {
      mockLogin.mockRejectedValue('something went wrong');
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(getInput(/^Username$/), 'bad');
      await user.type(getInput(/^Password$/), 'creds');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText('Login failed')).toBeInTheDocument();
      });
    });

    it('clears previous error on new submission', async () => {
      mockLogin.mockRejectedValueOnce(new Error('First error'));
      mockLogin.mockResolvedValueOnce(undefined);
      const user = userEvent.setup();
      render(<LoginPage />);

      // First attempt - error
      await user.type(getInput(/^Username$/), 'bad');
      await user.type(getInput(/^Password$/), 'creds');
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      await waitFor(() => expect(screen.getByText('First error')).toBeInTheDocument());

      // Second attempt - error should be cleared
      await user.click(screen.getByRole('button', { name: /sign in/i }));
      await waitFor(() => {
        expect(screen.queryByText('First error')).not.toBeInTheDocument();
      });
    });

    it('re-enables the button after login fails', async () => {
      mockLogin.mockRejectedValue(new Error('fail'));
      const user = userEvent.setup();
      render(<LoginPage />);

      await user.type(getInput(/^Username$/), 'bad');
      await user.type(getInput(/^Password$/), 'creds');
      await user.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByRole('button')).not.toBeDisabled();
      });
    });
  });
});
