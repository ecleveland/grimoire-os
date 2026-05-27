import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../auth-context';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const mockDisconnectSocket = vi.fn();
vi.mock('@/lib/socket', () => ({
  disconnectSocket: () => mockDisconnectSocket(),
}));

const TEST_PROFILE = {
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  email: 'test@example.com',
  avatarUrl: 'https://example.com/avatar.png',
  role: 'player',
};

function mockFetchResponse(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body ?? {}),
  } as unknown as Response;
}

function TestConsumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="authenticated">{String(auth.isAuthenticated)}</span>
      <span data-testid="username">{auth.user?.username ?? 'none'}</span>
      <span data-testid="role">{auth.user?.role ?? 'none'}</span>
      <span data-testid="displayName">{auth.user?.displayName ?? 'none'}</span>
      <span data-testid="isAdmin">{String(auth.isAdmin)}</span>
      <span data-testid="isDm">{String(auth.isDm)}</span>
      <button onClick={() => auth.login('testuser', 'password123')}>Login</button>
      <button onClick={() => auth.register({ username: 'newuser', password: 'password123' })}>
        Register
      </button>
      <button onClick={() => void auth.logout()}>Logout</button>
      <button onClick={auth.refreshProfile}>Refresh</button>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>
  );
}

describe('useAuth outside provider', () => {
  it('throws "useAuth must be used within an AuthProvider"', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useAuth must be used within an AuthProvider');
    spy.mockRestore();
  });
});

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockPush.mockReset();
    mockApiFetch.mockReset();
    mockDisconnectSocket.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('hydration', () => {
    it('calls GET /users/me with credentials:include on mount', async () => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse(401));

      renderWithProvider();

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/users/me'),
          expect.objectContaining({ credentials: 'include' })
        );
      });
    });

    it('hydrates user state from /users/me when the cookie is valid (200)', async () => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse(200, TEST_PROFILE));

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        expect(screen.getByTestId('username')).toHaveTextContent('testuser');
        expect(screen.getByTestId('displayName')).toHaveTextContent('Test User');
      });
    });

    it('stays unauthenticated when /users/me returns 401', async () => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse(401));

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
        expect(screen.getByTestId('username')).toHaveTextContent('none');
      });
    });

    it('does NOT redirect to /login on 401 during hydration', async () => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse(401));

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toBeInTheDocument();
      });
      expect(mockPush).not.toHaveBeenCalledWith('/login');
    });

    it('stays unauthenticated on network errors', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('network'));

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      });
    });
  });

  describe('login', () => {
    beforeEach(() => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(401)) // hydration call
        .mockResolvedValueOnce(mockFetchResponse(200, { user: TEST_PROFILE })); // login call
    });

    it('POSTs /auth/login with credentials:include and the JSON body', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());

      await user.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/auth/login'),
          expect.objectContaining({
            method: 'POST',
            credentials: 'include',
            body: JSON.stringify({ username: 'testuser', password: 'password123' }),
          })
        );
      });
    });

    it('populates the user from the response body (no token in body, no localStorage)', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());

      await user.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        expect(screen.getByTestId('username')).toHaveTextContent('testuser');
        expect(screen.getByTestId('displayName')).toHaveTextContent('Test User');
      });
    });

    it('navigates to / via router.push on success', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());

      await user.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('throws "Invalid credentials" on non-ok response', async () => {
      vi.mocked(fetch).mockReset();
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(401)) // hydration
        .mockResolvedValueOnce(mockFetchResponse(401)); // login
      const user = userEvent.setup();

      let loginError: Error | null = null;
      function ErrorCapture() {
        const auth = useAuth();
        return (
          <button
            onClick={async () => {
              try {
                await auth.login('bad', 'creds');
              } catch (e) {
                loginError = e as Error;
              }
            }}
          >
            LoginErr
          </button>
        );
      }

      render(
        <AuthProvider>
          <ErrorCapture />
        </AuthProvider>
      );
      await waitFor(() => expect(screen.getByText('LoginErr')).toBeInTheDocument());

      await user.click(screen.getByText('LoginErr'));

      await waitFor(() => {
        expect(loginError?.message).toBe('Invalid credentials');
      });
    });
  });

  describe('register', () => {
    beforeEach(() => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(401)) // hydration
        .mockResolvedValueOnce(mockFetchResponse(200, { user: TEST_PROFILE })); // register
    });

    it('POSTs /auth/register with credentials:include and the JSON body', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Register')).toBeInTheDocument());

      await user.click(screen.getByText('Register'));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/auth/register'),
          expect.objectContaining({
            method: 'POST',
            credentials: 'include',
            body: JSON.stringify({ username: 'newuser', password: 'password123' }),
          })
        );
      });
    });

    it('populates user from the response body and navigates home', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Register')).toBeInTheDocument());

      await user.click(screen.getByText('Register'));

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        expect(screen.getByTestId('username')).toHaveTextContent('testuser');
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('throws error message from response body when registration fails', async () => {
      vi.mocked(fetch).mockReset();
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(401))
        .mockResolvedValueOnce(mockFetchResponse(400, { message: 'Username taken' }));
      const user = userEvent.setup();

      let regError: Error | null = null;
      function ErrorCapture() {
        const auth = useAuth();
        return (
          <button
            onClick={async () => {
              try {
                await auth.register({ username: 'x', password: 'y' });
              } catch (e) {
                regError = e as Error;
              }
            }}
          >
            RegErr
          </button>
        );
      }

      render(
        <AuthProvider>
          <ErrorCapture />
        </AuthProvider>
      );
      await waitFor(() => expect(screen.getByText('RegErr')).toBeInTheDocument());

      await user.click(screen.getByText('RegErr'));

      await waitFor(() => {
        expect(regError?.message).toBe('Username taken');
      });
    });

    it('falls back to "Registration failed" when error body has no message', async () => {
      vi.mocked(fetch).mockReset();
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(401))
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: vi.fn().mockRejectedValue(new Error('not json')),
        } as unknown as Response);
      const user = userEvent.setup();

      let regError: Error | null = null;
      function ErrorCapture() {
        const auth = useAuth();
        return (
          <button
            onClick={async () => {
              try {
                await auth.register({ username: 'x', password: 'y' });
              } catch (e) {
                regError = e as Error;
              }
            }}
          >
            RegErr2
          </button>
        );
      }

      render(
        <AuthProvider>
          <ErrorCapture />
        </AuthProvider>
      );
      await waitFor(() => expect(screen.getByText('RegErr2')).toBeInTheDocument());

      await user.click(screen.getByText('RegErr2'));

      await waitFor(() => {
        expect(regError?.message).toBe('Registration failed');
      });
    });
  });

  describe('logout', () => {
    beforeEach(() => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(200, TEST_PROFILE)) // hydration (authenticated)
        .mockResolvedValue(mockFetchResponse(204)); // POST /auth/logout
    });

    it('POSTs /auth/logout with credentials:include', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

      await user.click(screen.getByText('Logout'));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/auth/logout'),
          expect.objectContaining({ method: 'POST', credentials: 'include' })
        );
      });
    });

    it('clears user state and navigates to /login', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

      await user.click(screen.getByText('Logout'));

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
        expect(screen.getByTestId('username')).toHaveTextContent('none');
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });

    it('still clears local state when /auth/logout call fails', async () => {
      vi.mocked(fetch).mockReset();
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(200, TEST_PROFILE))
        .mockRejectedValueOnce(new Error('network'));
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

      await user.click(screen.getByText('Logout'));

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });

    it('tears down the WebSocket connection', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

      await user.click(screen.getByText('Logout'));

      await waitFor(() => {
        expect(mockDisconnectSocket).toHaveBeenCalled();
      });
    });
  });

  describe('refreshProfile', () => {
    it('re-fetches profile via apiFetch /users/me and updates user state', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse(200, TEST_PROFILE));
      mockApiFetch.mockResolvedValue({ ...TEST_PROFILE, displayName: 'Updated Name' });
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

      await user.click(screen.getByText('Refresh'));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('/users/me');
        expect(screen.getByTestId('displayName')).toHaveTextContent('Updated Name');
      });
    });

    it('leaves user state unchanged when apiFetch rejects', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse(200, TEST_PROFILE));
      mockApiFetch.mockRejectedValue(new Error('network'));
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

      await user.click(screen.getByText('Refresh'));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('/users/me');
      });
      expect(screen.getByTestId('username')).toHaveTextContent('testuser');
    });
  });

  describe('role helpers', () => {
    it('isAdmin is true when user role is admin', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockFetchResponse(200, { ...TEST_PROFILE, role: 'admin', username: 'admin' })
      );

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('isAdmin')).toHaveTextContent('true');
        expect(screen.getByTestId('isDm')).toHaveTextContent('true');
      });
    });

    it('isDm is true when user role is dungeon_master', async () => {
      vi.mocked(fetch).mockResolvedValue(
        mockFetchResponse(200, { ...TEST_PROFILE, role: 'dungeon_master', username: 'dm' })
      );

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('isAdmin')).toHaveTextContent('false');
        expect(screen.getByTestId('isDm')).toHaveTextContent('true');
      });
    });

    it('isDm and isAdmin are false when user role is player', async () => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse(200, TEST_PROFILE));

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('isAdmin')).toHaveTextContent('false');
        expect(screen.getByTestId('isDm')).toHaveTextContent('false');
      });
    });
  });
});
