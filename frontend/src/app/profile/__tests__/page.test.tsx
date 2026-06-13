import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfilePage from '../page';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockRefreshProfile = vi.fn();
const mockUseAuth = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

const STRONG_PASSWORD = 'StrongP@ss1!';

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockRefreshProfile.mockReset();
  mockRefreshProfile.mockResolvedValue(undefined);
  mockUseAuth.mockReturnValue({
    user: {
      userId: 'user-1',
      username: 'gandalf',
      displayName: 'Gandalf the Grey',
      email: 'gandalf@middleearth.com',
      role: 'player',
    },
    refreshProfile: mockRefreshProfile,
  });
});

describe('ProfilePage', () => {
  it('shows a loading state and does not mount the form while the session is hydrating', () => {
    // Pre-hydration the provider reports user:null / isLoading:true. The form
    // seeds its fields from `user` in useState initializers, so mounting it here
    // would seed them empty and a save could blank the user's real values (VEG-320).
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: true,
      refreshProfile: mockRefreshProfile,
    });
    render(<ProfilePage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
  });

  it('renders nothing when hydration settles with no authenticated user', () => {
    // Middleware normally redirects an unauthed visitor away from /profile; if one
    // slips through, never mount the form (it would seed blank from a null user).
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      refreshProfile: mockRefreshProfile,
    });
    const { container } = render(<ProfilePage />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByLabelText(/display name/i)).not.toBeInTheDocument();
  });

  it('seeds the form from the user once hydration completes', () => {
    // isLoading false (beforeEach default) with a populated user → fields prefilled.
    render(<ProfilePage />);
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Gandalf the Grey');
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('gandalf@middleearth.com');
  });

  it('renders account details pre-filled, with username disabled', () => {
    render(<ProfilePage />);
    const username = screen.getByLabelText(/username/i);
    expect(username).toHaveValue('gandalf');
    expect(username).toBeDisabled();
    expect(screen.getByLabelText(/display name/i)).toHaveValue('Gandalf the Grey');
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('gandalf@middleearth.com');
  });

  it('marks display name as required so it cannot be fake-cleared', () => {
    render(<ProfilePage />);
    // displayName is non-nullable in the data model; the input must not allow
    // submitting an empty value that the backend would silently ignore.
    expect(screen.getByLabelText(/display name/i)).toBeRequired();
  });

  it('saves updated display name and email, then refreshes the profile', async () => {
    mockApiFetch.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.clear(screen.getByLabelText(/display name/i));
    await user.type(screen.getByLabelText(/display name/i), 'Gandalf the White');
    await user.clear(screen.getByLabelText(/^email$/i));
    await user.type(screen.getByLabelText(/^email$/i), 'white@middleearth.com');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Profile updated'));
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/users/me',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          displayName: 'Gandalf the White',
          email: 'white@middleearth.com',
        }),
      })
    );
    expect(mockRefreshProfile).toHaveBeenCalled();
  });

  it('sends email: null when the email field is cleared', async () => {
    mockApiFetch.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.clear(screen.getByLabelText(/^email$/i));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Profile updated'));
    const [, init] = mockApiFetch.mock.calls[0];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.email).toBeNull();
    expect(body.displayName).toBe('Gandalf the Grey');
  });

  it('sends email: null when the email field contains only whitespace', async () => {
    mockApiFetch.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.clear(screen.getByLabelText(/^email$/i));
    await user.type(screen.getByLabelText(/^email$/i), '   ');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Profile updated'));
    const [, init] = mockApiFetch.mock.calls[0];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.email).toBeNull();
  });

  it('shows the saving label while the update is in flight and toasts on Error rejection', async () => {
    let reject: (err: unknown) => void = () => {};
    mockApiFetch.mockReturnValueOnce(
      new Promise((_resolve, rej) => {
        reject = rej;
      })
    );
    const user = userEvent.setup();
    render(<ProfilePage />);
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    const saving = await screen.findByRole('button', { name: /saving\.\.\./i });
    expect(saving).toBeDisabled();

    reject(new Error('email already in use'));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('email already in use'));
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled();
    expect(mockRefreshProfile).not.toHaveBeenCalled();
  });

  it('toasts a generic message when the update rejection is not an Error', async () => {
    mockApiFetch.mockRejectedValueOnce('boom');
    const user = userEvent.setup();
    render(<ProfilePage />);
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Update failed'));
  });

  it('changes the password and clears the password fields on success', async () => {
    mockApiFetch.mockResolvedValue({});
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.type(screen.getByLabelText(/current password/i), 'OldP@ssword1!');
    await user.type(screen.getByLabelText(/^new password( \*)?$/i), STRONG_PASSWORD);
    await user.type(screen.getByLabelText(/confirm new password/i), STRONG_PASSWORD);
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Password changed'));
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/users/me/change-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          currentPassword: 'OldP@ssword1!',
          newPassword: STRONG_PASSWORD,
        }),
      })
    );
    expect(screen.getByLabelText(/current password/i)).toHaveValue('');
    expect(screen.getByLabelText(/^new password( \*)?$/i)).toHaveValue('');
    expect(screen.getByLabelText(/confirm new password/i)).toHaveValue('');
  });

  it('rejects a weak new password client-side without calling the API', async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.type(screen.getByLabelText(/current password/i), 'OldP@ssword1!');
    await user.type(screen.getByLabelText(/^new password( \*)?$/i), 'weak');
    await user.type(screen.getByLabelText(/confirm new password/i), 'weak');
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('rejects mismatched password confirmation without calling the API', async () => {
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.type(screen.getByLabelText(/current password/i), 'OldP@ssword1!');
    await user.type(screen.getByLabelText(/^new password( \*)?$/i), STRONG_PASSWORD);
    await user.type(screen.getByLabelText(/confirm new password/i), `${STRONG_PASSWORD}x`);
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Passwords do not match'));
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('toasts the server message when the password change fails with an Error', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Current password is incorrect'));
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.type(screen.getByLabelText(/current password/i), 'WrongP@ss1!');
    await user.type(screen.getByLabelText(/^new password( \*)?$/i), STRONG_PASSWORD);
    await user.type(screen.getByLabelText(/confirm new password/i), STRONG_PASSWORD);
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Current password is incorrect')
    );
  });

  it('toasts a generic message when the password change rejection is not an Error', async () => {
    mockApiFetch.mockRejectedValueOnce('boom');
    const user = userEvent.setup();
    render(<ProfilePage />);

    await user.type(screen.getByLabelText(/current password/i), 'OldP@ssword1!');
    await user.type(screen.getByLabelText(/^new password( \*)?$/i), STRONG_PASSWORD);
    await user.type(screen.getByLabelText(/confirm new password/i), STRONG_PASSWORD);
    await user.click(screen.getByRole('button', { name: /change password/i }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Password change failed'));
  });
});
