import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../auth-context';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockJwt(payload: { sub: string; username: string; role: string }): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const signature = btoa('mock-signature');
  return `${header}.${body}.${signature}`;
}

const TEST_JWT_PAYLOAD = { sub: 'user-1', username: 'testuser', role: 'player' };
const TEST_JWT = createMockJwt(TEST_JWT_PAYLOAD);

const TEST_PROFILE = {
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  email: 'test@example.com',
  avatarUrl: 'https://example.com/avatar.png',
  role: 'player',
};

function createMockLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(k => delete store[k]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
}

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
      <button onClick={auth.logout}>Logout</button>
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

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAuth outside provider', () => {
  it('throws "useAuth must be used within an AuthProvider"', () => {
    // Suppress React error boundary console output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow('useAuth must be used within an AuthProvider');
    spy.mockRestore();
  });
});

describe('AuthProvider', () => {
  let mockLocalStorage: ReturnType<typeof createMockLocalStorage>;

  beforeEach(() => {
    mockLocalStorage = createMockLocalStorage();
    vi.stubGlobal('localStorage', mockLocalStorage);
    vi.stubGlobal('fetch', vi.fn());
    mockPush.mockReset();
    mockApiFetch.mockReset();
    document.cookie = '';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('hydration', () => {
    it('renders children after hydration', async () => {
      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toBeInTheDocument();
      });
    });

    it('restores isAuthenticated=true when token exists in localStorage', async () => {
      mockLocalStorage.setItem('token', TEST_JWT);

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      });
    });

    it('restores user from localStorage when stored user JSON is valid', async () => {
      mockLocalStorage.setItem('token', TEST_JWT);
      mockLocalStorage.setItem(
        'user',
        JSON.stringify({
          userId: 'user-1',
          username: 'testuser',
          role: 'player',
          displayName: 'Test User',
        })
      );

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('username')).toHaveTextContent('testuser');
        expect(screen.getByTestId('displayName')).toHaveTextContent('Test User');
      });
    });

    it('clears corrupted user JSON from localStorage and sets user to null', async () => {
      mockLocalStorage.setItem('token', TEST_JWT);
      mockLocalStorage.setItem('user', 'not-valid-json');

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        expect(screen.getByTestId('username')).toHaveTextContent('none');
      });
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('user');
    });

    it('starts unauthenticated when no token in localStorage', async () => {
      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
        expect(screen.getByTestId('username')).toHaveTextContent('none');
      });
    });
  });

  describe('login', () => {
    beforeEach(() => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse(200, { access_token: TEST_JWT }));
      mockApiFetch.mockResolvedValue(TEST_PROFILE);
    });

    it('calls fetch with /auth/login, POST, and credentials as JSON body', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());

      await user.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/auth/login'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ username: 'testuser', password: 'password123' }),
          })
        );
      });
    });

    it('stores token in localStorage on success', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());

      await user.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith('token', TEST_JWT);
      });
    });

    it('sets auth-flag cookie on success', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());

      await user.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(document.cookie).toContain('auth-flag=1');
      });
    });

    it('sets isAuthenticated to true', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());

      await user.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      });
    });

    it('fetches profile via apiFetch /users/me', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());

      await user.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('/users/me');
      });
    });

    it('sets user with profile data merged with JWT payload', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());

      await user.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(screen.getByTestId('username')).toHaveTextContent('testuser');
        expect(screen.getByTestId('displayName')).toHaveTextContent('Test User');
      });
    });

    it('stores user in localStorage', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());

      await user.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'user',
          expect.stringContaining('"username":"testuser"')
        );
      });
    });

    it('navigates to / via router.push', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());

      await user.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('throws "Invalid credentials" when fetch returns non-ok response', async () => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse(401));
      const user = userEvent.setup();

      // We need to catch the error from login. The TestConsumer doesn't handle errors,
      // so we test via a custom component.
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
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse(200, { access_token: TEST_JWT }));
      mockApiFetch.mockResolvedValue(TEST_PROFILE);
    });

    it('calls fetch with /auth/register, POST, and registration data', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Register')).toBeInTheDocument());

      await user.click(screen.getByText('Register'));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/auth/register'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ username: 'newuser', password: 'password123' }),
          })
        );
      });
    });

    it('stores token and sets cookie on success', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Register')).toBeInTheDocument());

      await user.click(screen.getByText('Register'));

      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith('token', TEST_JWT);
        expect(document.cookie).toContain('auth-flag=1');
      });
    });

    it('sets isAuthenticated to true and populates user', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Register')).toBeInTheDocument());

      await user.click(screen.getByText('Register'));

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        expect(screen.getByTestId('username')).toHaveTextContent('testuser');
      });
    });

    it('navigates to / via router.push', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Register')).toBeInTheDocument());

      await user.click(screen.getByText('Register'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });

    it('throws error message from response body when registration fails', async () => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse(400, { message: 'Username taken' }));
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

    it('throws "Registration failed" when error body has no message', async () => {
      vi.mocked(fetch).mockResolvedValue({
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
    it('removes token and user from localStorage', async () => {
      mockLocalStorage.setItem('token', TEST_JWT);
      mockLocalStorage.setItem(
        'user',
        JSON.stringify({ userId: 'user-1', username: 'testuser', role: 'player' })
      );
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

      await user.click(screen.getByText('Logout'));

      await waitFor(() => {
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('token');
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('user');
      });
    });

    it('clears auth-flag cookie', async () => {
      mockLocalStorage.setItem('token', TEST_JWT);
      document.cookie = 'auth-flag=1; path=/';
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

      await user.click(screen.getByText('Logout'));

      await waitFor(() => {
        expect(document.cookie).not.toContain('auth-flag=1');
      });
    });

    it('sets isAuthenticated to false and user to null', async () => {
      mockLocalStorage.setItem('token', TEST_JWT);
      mockLocalStorage.setItem(
        'user',
        JSON.stringify({ userId: 'user-1', username: 'testuser', role: 'player' })
      );
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

      await user.click(screen.getByText('Logout'));

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
        expect(screen.getByTestId('username')).toHaveTextContent('none');
      });
    });

    it('navigates to /login via router.push', async () => {
      mockLocalStorage.setItem('token', TEST_JWT);
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

      await user.click(screen.getByText('Logout'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });
  });

  describe('refreshProfile', () => {
    it('re-fetches profile from /users/me and updates user state', async () => {
      mockLocalStorage.setItem('token', TEST_JWT);
      mockLocalStorage.setItem(
        'user',
        JSON.stringify({ userId: 'user-1', username: 'testuser', role: 'player' })
      );
      mockApiFetch.mockResolvedValue({
        ...TEST_PROFILE,
        displayName: 'Updated Name',
      });
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

      await user.click(screen.getByText('Refresh'));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('/users/me');
        expect(screen.getByTestId('displayName')).toHaveTextContent('Updated Name');
      });
    });

    it('does nothing when no token in localStorage', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Refresh')).toBeInTheDocument());

      await user.click(screen.getByText('Refresh'));

      // Small wait to ensure no async calls happened
      await act(async () => {
        await new Promise(r => setTimeout(r, 50));
      });
      expect(mockApiFetch).not.toHaveBeenCalled();
    });
  });

  describe('role helpers', () => {
    it('isAdmin is true when user role is admin', async () => {
      const adminJwt = createMockJwt({ sub: 'u-1', username: 'admin', role: 'admin' });
      mockLocalStorage.setItem('token', adminJwt);
      mockLocalStorage.setItem(
        'user',
        JSON.stringify({ userId: 'u-1', username: 'admin', role: 'admin' })
      );

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('isAdmin')).toHaveTextContent('true');
      });
    });

    it('isAdmin is false when user role is player', async () => {
      mockLocalStorage.setItem('token', TEST_JWT);
      mockLocalStorage.setItem(
        'user',
        JSON.stringify({ userId: 'user-1', username: 'testuser', role: 'player' })
      );

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('isAdmin')).toHaveTextContent('false');
      });
    });

    it('isDm is true when user role is dungeon_master', async () => {
      const dmJwt = createMockJwt({ sub: 'u-2', username: 'dm', role: 'dungeon_master' });
      mockLocalStorage.setItem('token', dmJwt);
      mockLocalStorage.setItem(
        'user',
        JSON.stringify({ userId: 'u-2', username: 'dm', role: 'dungeon_master' })
      );

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('isDm')).toHaveTextContent('true');
      });
    });

    it('isDm is true when user role is admin', async () => {
      const adminJwt = createMockJwt({ sub: 'u-1', username: 'admin', role: 'admin' });
      mockLocalStorage.setItem('token', adminJwt);
      mockLocalStorage.setItem(
        'user',
        JSON.stringify({ userId: 'u-1', username: 'admin', role: 'admin' })
      );

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('isDm')).toHaveTextContent('true');
      });
    });

    it('isDm is false when user role is player', async () => {
      mockLocalStorage.setItem('token', TEST_JWT);
      mockLocalStorage.setItem(
        'user',
        JSON.stringify({ userId: 'user-1', username: 'testuser', role: 'player' })
      );

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('isDm')).toHaveTextContent('false');
      });
    });
  });

  describe('fetchAndStoreProfile fallback', () => {
    it('sets user from JWT payload alone when /users/me fetch fails', async () => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse(200, { access_token: TEST_JWT }));
      mockApiFetch.mockRejectedValue(new Error('Network error'));
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByText('Login')).toBeInTheDocument());

      await user.click(screen.getByText('Login'));

      await waitFor(() => {
        expect(screen.getByTestId('username')).toHaveTextContent('testuser');
        expect(screen.getByTestId('displayName')).toHaveTextContent('none');
      });
    });
  });
});
