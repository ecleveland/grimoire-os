import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RegisterPage from '../page';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockRegister = vi.fn();

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    register: mockRegister,
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Labels in the source don't use htmlFor, so getByLabelText won't work.
 *  Find the input inside the same parent div as the label text. */
function getInput(labelText: RegExp): HTMLInputElement {
  const label = screen.getByText(labelText);
  return label.parentElement!.querySelector('input')! as HTMLInputElement;
}

const STRONG_PASSWORD = 'SecurePass1!23';

async function fillRequiredFields(
  user: ReturnType<typeof userEvent.setup>,
  overrides: {
    username?: string;
    password?: string;
    confirmPassword?: string;
    displayName?: string;
    email?: string;
  } = {}
) {
  const {
    username = 'testuser',
    password = STRONG_PASSWORD,
    confirmPassword = STRONG_PASSWORD,
    displayName,
    email,
  } = overrides;

  await user.type(getInput(/^Username$/), username);
  if (displayName) {
    await user.type(getInput(/^Display Name$/), displayName);
  }
  if (email) {
    await user.type(getInput(/^Email$/), email);
  }
  await user.type(getInput(/^Password$/), password);
  await user.type(getInput(/^Confirm Password$/), confirmPassword);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('RegisterPage', () => {
  beforeEach(() => {
    mockRegister.mockReset();
  });

  describe('rendering', () => {
    it('renders the heading "Create Account"', () => {
      render(<RegisterPage />);
      expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    });

    it('renders username input with required attribute', () => {
      render(<RegisterPage />);
      expect(getInput(/^Username$/)).toBeRequired();
    });

    it('renders display name input (not required)', () => {
      render(<RegisterPage />);
      expect(getInput(/^Display Name$/)).not.toBeRequired();
    });

    it('renders email input (not required)', () => {
      render(<RegisterPage />);
      expect(getInput(/^Email$/)).not.toBeRequired();
    });

    it('renders password input with required attribute', () => {
      render(<RegisterPage />);
      expect(getInput(/^Password$/)).toBeRequired();
    });

    it('renders confirm password input with required attribute', () => {
      render(<RegisterPage />);
      expect(getInput(/^Confirm Password$/)).toBeRequired();
    });

    it('renders submit button with text "Create Account"', () => {
      render(<RegisterPage />);
      expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    });

    it('renders link to /login', () => {
      render(<RegisterPage />);
      const link = screen.getByRole('link', { name: /sign in/i });
      expect(link).toHaveAttribute('href', '/login');
    });
  });

  describe('client-side validation', () => {
    it('shows length error for a password shorter than 10 characters', async () => {
      const user = userEvent.setup();
      render(<RegisterPage />);

      await fillRequiredFields(user, { password: 'Aa1!short', confirmPassword: 'Aa1!short' });
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Password must be at least 10 characters')).toBeInTheDocument();
      });
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('shows uppercase error when password lacks an uppercase letter', async () => {
      const user = userEvent.setup();
      render(<RegisterPage />);

      const weak = 'lowercase1!23';
      await fillRequiredFields(user, { password: weak, confirmPassword: weak });
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(
          screen.getByText('Password must contain at least one uppercase letter')
        ).toBeInTheDocument();
      });
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('shows special-character error when password lacks one', async () => {
      const user = userEvent.setup();
      render(<RegisterPage />);

      const weak = 'NoSpecial1234';
      await fillRequiredFields(user, { password: weak, confirmPassword: weak });
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(
          screen.getByText('Password must contain at least one special character')
        ).toBeInTheDocument();
      });
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('shows "Passwords do not match" when passwords differ', async () => {
      const user = userEvent.setup();
      render(<RegisterPage />);

      await fillRequiredFields(user, {
        password: STRONG_PASSWORD,
        confirmPassword: 'Different1!23',
      });
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      });
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('renders the password requirements helper text', () => {
      render(<RegisterPage />);
      expect(
        screen.getByText(/Must be at least 10 characters and include uppercase/i)
      ).toBeInTheDocument();
    });
  });

  describe('form submission - happy path', () => {
    it('calls register with username, password, displayName, and email', async () => {
      mockRegister.mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<RegisterPage />);

      await fillRequiredFields(user, {
        username: 'newuser',
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
        displayName: 'New User',
        email: 'new@example.com',
      });
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith({
          username: 'newuser',
          password: STRONG_PASSWORD,
          displayName: 'New User',
          email: 'new@example.com',
        });
      });
    });

    it('omits displayName and email from payload when fields are empty', async () => {
      mockRegister.mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<RegisterPage />);

      await fillRequiredFields(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith({
          username: 'testuser',
          password: STRONG_PASSWORD,
          displayName: undefined,
          email: undefined,
        });
      });
    });

    it('shows "Creating account..." on button while loading', async () => {
      mockRegister.mockImplementation(() => new Promise(() => {}));
      const user = userEvent.setup();
      render(<RegisterPage />);

      await fillRequiredFields(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('button')).toHaveTextContent('Creating account...');
        expect(screen.getByRole('button')).toBeDisabled();
      });
    });

    it('re-enables the button after register completes', async () => {
      mockRegister.mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<RegisterPage />);

      await fillRequiredFields(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByRole('button')).toHaveTextContent('Create Account');
        expect(screen.getByRole('button')).not.toBeDisabled();
      });
    });
  });

  describe('form submission - error handling', () => {
    it('displays error message when register throws an Error', async () => {
      mockRegister.mockRejectedValue(new Error('Username taken'));
      const user = userEvent.setup();
      render(<RegisterPage />);

      await fillRequiredFields(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Username taken')).toBeInTheDocument();
      });
    });

    it('displays "Registration failed" when register throws a non-Error', async () => {
      mockRegister.mockRejectedValue('something broke');
      const user = userEvent.setup();
      render(<RegisterPage />);

      await fillRequiredFields(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText('Registration failed')).toBeInTheDocument();
      });
    });

    it('clears previous error on new submission attempt', async () => {
      mockRegister.mockRejectedValueOnce(new Error('First error'));
      mockRegister.mockResolvedValueOnce(undefined);
      const user = userEvent.setup();
      render(<RegisterPage />);

      // First attempt - error
      await fillRequiredFields(user);
      await user.click(screen.getByRole('button', { name: /create account/i }));
      await waitFor(() => expect(screen.getByText('First error')).toBeInTheDocument());

      // Second attempt - error should be cleared
      await user.click(screen.getByRole('button', { name: /create account/i }));
      await waitFor(() => {
        expect(screen.queryByText('First error')).not.toBeInTheDocument();
      });
    });
  });
});
