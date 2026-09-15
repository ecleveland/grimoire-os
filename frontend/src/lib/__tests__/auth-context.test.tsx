import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';
import { AuthProvider, useAuth } from '../auth-context';
import { useApiQuery } from '../query';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockApiFetch = vi.fn();
const mockEndDeadSession = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  endDeadSession: (...args: unknown[]) => mockEndDeadSession(...args),
}));

const mockToastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
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
      <span data-testid="isLoading">{String(auth.isLoading)}</span>
      <span data-testid="likelyAuthenticated">{String(auth.likelyAuthenticated)}</span>
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

/** AuthProvider reads the query client, as it does under the root layout's QueryProvider. */
function renderInQueryClient(ui: ReactElement, client: QueryClient = new QueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper });
}

function renderWithProvider(client?: QueryClient) {
  return renderInQueryClient(
    <AuthProvider>
      <TestConsumer />
    </AuthProvider>,
    client
  );
}

/**
 * A protected page, mounted alongside the consumer that logs out. It observes a
 * cached query and reads `useAuth`, as the real ones do, so a change of user
 * re-renders it while it is still the page on screen.
 */
function CachedPageReader() {
  const { isAuthenticated } = useAuth();
  const { data } = useApiQuery<{ subclasses: { name: string }[] }>('/srd/classes/cls-fighter');
  return <span data-testid="cached-page">{`${data ? 'loaded' : 'empty'}/${isAuthenticated}`}</span>;
}

function renderWithCachedPage(client: QueryClient) {
  return renderInQueryClient(
    <AuthProvider>
      <TestConsumer />
      <CachedPageReader />
    </AuthProvider>,
    client
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
  const originalLocation = window.location;
  const mockAssign = vi.fn();
  const mockReplace = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    mockPush.mockReset();
    mockAssign.mockReset();
    mockReplace.mockReset();
    mockToastError.mockReset();
    mockApiFetch.mockReset();
    mockEndDeadSession.mockReset();
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      // `assign` and `replace` are Location prototype methods, so the spread
      // above doesn't copy them. Stub both so logout's full page load is a no-op
      // we can assert on, and so a navigation by either one is visible.
      value: { ...originalLocation, assign: mockAssign, replace: mockReplace, pathname: '/' },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', {
      writable: true,
      configurable: true,
      value: originalLocation,
    });
    // jsdom persists document.cookie across tests — clear the session-present hint cookie
    // so a test that sets it can't leak into the next (which would silently make
    // likelyAuthenticated-blind assertions start seeing a "probable session").
    document.cookie = 'session_present=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  describe('auth gate (renders children immediately)', () => {
    it('renders children synchronously while hydration is still in flight', () => {
      // A never-resolving hydration request models the window before /users/me
      // answers. The old `if (!hydrated) return null` gate returned nothing here,
      // blanking public pages; children must now render right away.
      vi.mocked(fetch).mockReturnValue(new Promise<Response>(() => {}));

      renderWithProvider();

      expect(screen.getByTestId('authenticated')).toBeInTheDocument();
      expect(screen.getByTestId('isLoading')).toHaveTextContent('true');
    });

    it('flips isLoading to false once hydration settles unauthenticated (401)', async () => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse(401));

      renderWithProvider();
      expect(screen.getByTestId('isLoading')).toHaveTextContent('true');

      await waitFor(() => {
        expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      });
    });

    it('flips isLoading to false once hydration settles authenticated (200)', async () => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse(200, TEST_PROFILE));

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
      });
    });
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

    it('hydrates via /auth/refresh when /users/me 401s but refresh succeeds', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(401)) // /users/me — access cookie expired
        .mockResolvedValueOnce(mockFetchResponse(200)) // /auth/refresh — refresh cookie still valid
        .mockResolvedValueOnce(mockFetchResponse(200, TEST_PROFILE)); // /users/me retry

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        expect(screen.getByTestId('username')).toHaveTextContent('testuser');
      });
      const calls = vi.mocked(fetch).mock.calls;
      expect(calls[1][0]).toMatch(/\/auth\/refresh$/);
      expect(calls[1][1]).toEqual(expect.objectContaining({ method: 'POST' }));
    });

    it('stays unauthenticated when /auth/refresh also 401s', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(401)) // /users/me
        .mockResolvedValueOnce(mockFetchResponse(401)); // /auth/refresh

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      });
      expect(mockPush).not.toHaveBeenCalledWith('/login');
    });

    it('makes at most one /auth/refresh attempt on a failed hydration (no refresh storm)', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(401)) // /users/me
        .mockResolvedValueOnce(mockFetchResponse(401)); // /auth/refresh

      renderWithProvider();

      await waitFor(() => {
        expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      });
      const refreshCalls = vi
        .mocked(fetch)
        .mock.calls.filter(c => String(c[0]).match(/\/auth\/refresh$/));
      expect(refreshCalls).toHaveLength(1);
    });

    describe('present-but-invalid session (VEG-419)', () => {
      // A leftover session_present cookie means a session existed; when /users/me
      // 401s and the single refresh can't restore it, the session is dead. The
      // stale httpOnly access cookie must be cleared (via endDeadSession →
      // POST /auth/logout) so the middleware stops bouncing /login ↔ /.

      it('ends the dead session when refresh also 401s and a session_present cookie is set', async () => {
        document.cookie = 'session_present=1';
        vi.mocked(fetch)
          .mockResolvedValueOnce(mockFetchResponse(401)) // /users/me — access dead
          .mockResolvedValueOnce(mockFetchResponse(401)); // /auth/refresh — refresh dead

        renderWithProvider();

        await waitFor(() => {
          expect(mockEndDeadSession).toHaveBeenCalledTimes(1);
        });
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      });

      it('ends the dead session when refresh is throttled (429) — does not wedge', async () => {
        document.cookie = 'session_present=1';
        vi.mocked(fetch)
          .mockResolvedValueOnce(mockFetchResponse(401)) // /users/me
          .mockResolvedValueOnce(mockFetchResponse(429)); // /auth/refresh throttled

        renderWithProvider();

        await waitFor(() => {
          expect(mockEndDeadSession).toHaveBeenCalledTimes(1);
        });
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      });

      it('does NOT end the session for an anonymous visitor (no session_present cookie)', async () => {
        // Public-page visitors (/srd, /login) have no session to clear — they
        // must not be logged out or redirected.
        vi.mocked(fetch)
          .mockResolvedValueOnce(mockFetchResponse(401)) // /users/me
          .mockResolvedValueOnce(mockFetchResponse(401)); // /auth/refresh

        renderWithProvider();

        await waitFor(() => {
          expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
        });
        expect(mockEndDeadSession).not.toHaveBeenCalled();
        expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      });

      it('does NOT end the session when a refresh restores it', async () => {
        document.cookie = 'session_present=1';
        vi.mocked(fetch)
          .mockResolvedValueOnce(mockFetchResponse(401)) // /users/me
          .mockResolvedValueOnce(mockFetchResponse(200)) // /auth/refresh ok
          .mockResolvedValueOnce(mockFetchResponse(200, TEST_PROFILE)); // /users/me retry

        renderWithProvider();

        await waitFor(() => {
          expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
        });
        expect(mockEndDeadSession).not.toHaveBeenCalled();
      });
    });
  });

  describe('login', () => {
    beforeEach(() => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(401)) // hydration /users/me
        .mockResolvedValueOnce(mockFetchResponse(401)) // hydration /auth/refresh
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
        .mockResolvedValueOnce(mockFetchResponse(401)) // hydration /users/me
        .mockResolvedValueOnce(mockFetchResponse(401)) // hydration /auth/refresh
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

      renderInQueryClient(
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
        .mockResolvedValueOnce(mockFetchResponse(401)) // hydration /users/me
        .mockResolvedValueOnce(mockFetchResponse(401)) // hydration /auth/refresh
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
        .mockResolvedValueOnce(mockFetchResponse(401)) // hydration /users/me
        .mockResolvedValueOnce(mockFetchResponse(401)) // hydration /auth/refresh
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

      renderInQueryClient(
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
        .mockResolvedValueOnce(mockFetchResponse(401)) // hydration /users/me
        .mockResolvedValueOnce(mockFetchResponse(401)) // hydration /auth/refresh
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

      renderInQueryClient(
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

    it('leaves for /login by a full page load, not a soft navigation', async () => {
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

      await user.click(screen.getByText('Logout'));

      // `replace`, not `assign`, so Back can't return to the signed-in page.
      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
      expect(mockAssign).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    // A logout that never reached the server leaves the cookies set, so /login
    // would bounce straight back to / and look like nothing happened.
    it('stays put and says so when the /auth/logout call fails', async () => {
      vi.mocked(fetch).mockReset();
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(200, TEST_PROFILE))
        .mockRejectedValueOnce(new Error('network'));
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

      await user.click(screen.getByText('Logout'));

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith(
          'Could not sign out. Check your connection and try again.'
        )
      );
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockAssign).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    });

    it('stays put and says so when /auth/logout answers 500', async () => {
      vi.mocked(fetch).mockReset();
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(200, TEST_PROFILE))
        .mockResolvedValueOnce(mockFetchResponse(500));
      const user = userEvent.setup();
      renderWithProvider();
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));

      await user.click(screen.getByText('Logout'));

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith(
          'Could not sign out. Check your connection and try again.'
        )
      );
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  // Cached API responses are per viewer but keyed by path alone, so a response
  // cached for one account must never be served to the next one in the same tab
  // through login or register.
  describe('query cache across a change of user', () => {
    const SECRET_KEY = ['api', '/srd/classes/cls-fighter'];
    const OTHER_PROFILE = { ...TEST_PROFILE, id: 'user-2', username: 'otheruser' };

    function seededClient() {
      // The app's staleTime, so a reader of the seeded entry serves it instead of
      // refetching on mount, and any refetch below is one a logout caused.
      const client = new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000, retry: false } },
      });
      client.setQueryData(SECRET_KEY, { subclasses: [{ name: 'Private Deadeye' }] });
      return client;
    }

    // Clearing the cache while the page being left is still mounted makes its
    // observers rebuild and refetch with the cookies already gone, which walks
    // apiFetch through a 401, a failed refresh and its dead-session teardown.
    it('does not refetch the page being logged out of', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(200, TEST_PROFILE))
        .mockResolvedValue(mockFetchResponse(204));
      const client = seededClient();
      const user = userEvent.setup();
      renderWithCachedPage(client);
      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
      expect(screen.getByTestId('cached-page')).toHaveTextContent('loaded/true');

      await user.click(screen.getByText('Logout'));

      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
      expect(mockApiFetch).not.toHaveBeenCalledWith('/srd/classes/cls-fighter');
    });

    it('clears the cache when another user logs in', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(200, TEST_PROFILE)) // hydration as user-1
        .mockResolvedValueOnce(mockFetchResponse(200, { user: OTHER_PROFILE })); // login as user-2
      const client = seededClient();
      const user = userEvent.setup();
      renderWithProvider(client);
      await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('testuser'));

      await user.click(screen.getByText('Login'));

      await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('otheruser'));
      expect(client.getQueryData(SECRET_KEY)).toBeUndefined();
    });

    it('clears the cache when a new account registers', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(401)) // hydration /users/me
        .mockResolvedValueOnce(mockFetchResponse(401)) // hydration /auth/refresh
        .mockResolvedValueOnce(mockFetchResponse(201, { user: OTHER_PROFILE })); // register
      const client = seededClient();
      const user = userEvent.setup();
      renderWithProvider(client);
      await waitFor(() => expect(screen.getByTestId('isLoading')).toHaveTextContent('false'));

      await user.click(screen.getByText('Register'));

      await waitFor(() => expect(screen.getByTestId('username')).toHaveTextContent('otheruser'));
      expect(client.getQueryData(SECRET_KEY)).toBeUndefined();
    });

    it('keeps the cache through the initial hydration of an existing session', async () => {
      vi.mocked(fetch).mockResolvedValue(mockFetchResponse(200, TEST_PROFILE));
      const client = seededClient();
      renderWithProvider(client);

      await waitFor(() => expect(screen.getByTestId('authenticated')).toHaveTextContent('true'));
      expect(client.getQueryData(SECRET_KEY)).toEqual({
        subclasses: [{ name: 'Private Deadeye' }],
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

  describe('likelyAuthenticated (session-present cookie hint for pre-hydration chrome, VEG-339)', () => {
    it('is true on first render when the session_present cookie is present (before hydration settles)', () => {
      document.cookie = 'session_present=1';
      // A never-resolving /users/me keeps isLoading true — the pre-hydration window.
      vi.mocked(fetch).mockReturnValue(new Promise<Response>(() => {}));

      renderWithProvider();

      expect(screen.getByTestId('isLoading')).toHaveTextContent('true');
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
      expect(screen.getByTestId('likelyAuthenticated')).toHaveTextContent('true');
    });

    it('is false when no session_present cookie is present (settled-anonymous stays clean)', () => {
      vi.mocked(fetch).mockReturnValue(new Promise<Response>(() => {}));

      renderWithProvider();

      expect(screen.getByTestId('likelyAuthenticated')).toHaveTextContent('false');
    });

    it('treats an empty session_present= value as no session (not a false-positive hint)', () => {
      document.cookie = 'session_present=';
      vi.mocked(fetch).mockReturnValue(new Promise<Response>(() => {}));

      renderWithProvider();

      expect(screen.getByTestId('likelyAuthenticated')).toHaveTextContent('false');
    });

    it('settles to non-stuck anonymous chrome when a stale cookie hydrates to 401', async () => {
      // The real-world case VEG-339 guards: a leftover session_present cookie, but the
      // session is dead. The skeleton (isLoading && likelyAuthenticated) must
      // show during hydration, then collapse — isLoading flips false and the
      // user stays unauthenticated, so the gate goes false and nothing sticks.
      document.cookie = 'session_present=1';
      vi.mocked(fetch)
        .mockResolvedValueOnce(mockFetchResponse(401)) // /users/me — access dead
        .mockResolvedValueOnce(mockFetchResponse(401)); // /auth/refresh — refresh dead

      renderWithProvider();

      // During hydration the gate is open (skeleton would render).
      expect(screen.getByTestId('isLoading')).toHaveTextContent('true');
      expect(screen.getByTestId('likelyAuthenticated')).toHaveTextContent('true');

      await waitFor(() => {
        expect(screen.getByTestId('isLoading')).toHaveTextContent('false');
      });
      // Settled: unauthenticated, so `isLoading && likelyAuthenticated` is now
      // false — the chrome collapses to the anonymous state, never stuck.
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    });

    it('re-derives on a window focus event when the cookie changes in another tab', async () => {
      document.cookie = 'session_present=1';
      vi.mocked(fetch).mockReturnValue(new Promise<Response>(() => {}));

      renderWithProvider();
      expect(screen.getByTestId('likelyAuthenticated')).toHaveTextContent('true');

      // Signed out elsewhere: the cookie vanishes, and a focus event (the
      // store's subscribe signal) must re-read the snapshot to false.
      document.cookie = 'session_present=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      fireEvent(window, new Event('focus'));

      await waitFor(() => {
        expect(screen.getByTestId('likelyAuthenticated')).toHaveTextContent('false');
      });
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
