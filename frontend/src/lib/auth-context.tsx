'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from './api';
import { Role } from './types';
import type { User } from './types';

interface UserInfo {
  userId: string;
  username: string;
  role: Role;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  /**
   * True until the initial session-hydration round-trip settles. Pages that
   * gate on identity (redirect-on-not-admin, "sign in to…" prompts) must wait
   * for this to be false before acting — otherwise they fire against the
   * pre-hydration `user === null` and bounce a legitimately-authed user.
   */
  isLoading: boolean;
  /**
   * A client-readable proxy for "this browser has an active session", derived
   * from the presence of the non-httpOnly `csrf_token` cookie (minted only on
   * login/register/refresh). Available synchronously at hydration — before the
   * `/users/me` round-trip settles `isAuthenticated` — so auth-gated *chrome*
   * can reserve its layout space while `isLoading` instead of popping in and
   * shifting content (VEG-339). It's a hint, not ground truth: trust
   * `isAuthenticated` once `isLoading` is false.
   */
  likelyAuthenticated: boolean;
  user: UserInfo | null;
  isAdmin: boolean;
  isDm: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: {
    username: string;
    password: string;
    displayName?: string;
    email?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const CSRF_COOKIE_NAME = 'csrf_token';

// `likelyAuthenticated` is read through useSyncExternalStore so the server
// snapshot is a stable `false` — matching the anonymous-first HTML that the
// static SRD pages prerender — while the client re-derives from the real cookie
// after hydration, with no mismatch warning. The cookie only changes on
// login/logout/refresh, all of which re-render this provider via `setUser`
// (re-reading the snapshot), so `subscribe` only needs to cover the cross-tab
// case (signed in/out in another tab) via the window `focus` event.
function subscribeCsrfCookie(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('focus', onChange);
  return () => window.removeEventListener('focus', onChange);
}

function getCsrfCookieSnapshot(): boolean {
  if (typeof document === 'undefined') return false;
  const prefix = `${CSRF_COOKIE_NAME}=`;
  // Require a non-empty value, not just the cookie name: the backend always
  // mints a real token and removes (not blanks) the cookie on logout, so an
  // empty `csrf_token=` shouldn't occur — but treating it as "no session"
  // keeps the hint honest if it ever does.
  return document.cookie
    .split('; ')
    .some(part => part.startsWith(prefix) && part.length > prefix.length);
}

function getCsrfCookieServerSnapshot(): boolean {
  return false;
}

function toUserInfo(profile: User & { id: string }): UserInfo {
  return {
    userId: profile.id,
    username: profile.username,
    role: profile.role,
    displayName: profile.displayName ?? undefined,
    email: profile.email ?? undefined,
    avatarUrl: profile.avatarUrl ?? undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const likelyAuthenticated = useSyncExternalStore(
    subscribeCsrfCookie,
    getCsrfCookieSnapshot,
    getCsrfCookieServerSnapshot
  );
  const router = useRouter();

  // Hydration: ask the backend whether the access cookie still represents a
  // valid session. Use raw fetch (not apiFetch) so a 401 here does NOT trigger
  // apiFetch's redirect-to-login — public pages should remain reachable. If
  // /users/me 401s, try /auth/refresh once: the user may still have a valid
  // refresh cookie even though the 15-minute access token has expired.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let res = await fetch(`${API_URL}/users/me`, { credentials: 'include' });
        if (res.status === 401) {
          const refreshed = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
          });
          if (refreshed.ok) {
            res = await fetch(`${API_URL}/users/me`, { credentials: 'include' });
          }
        }
        if (!cancelled && res.ok) {
          const profile = (await res.json()) as User & { id: string };
          setUser(toUserInfo(profile));
        }
      } catch {
        // Network errors stay logged out.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        throw new Error('Invalid credentials');
      }

      const { user: profile } = (await res.json()) as { user: User & { id: string } };
      setUser(toUserInfo(profile));
      router.push('/');
    },
    [router]
  );

  const register = useCallback(
    async (data: { username: string; password: string; displayName?: string; email?: string }) => {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Registration failed');
      }

      const { user: profile } = (await res.json()) as { user: User & { id: string } };
      setUser(toUserInfo(profile));
      router.push('/');
    },
    [router]
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Even if the server call fails, clear local state.
    }
    setUser(null);
    router.push('/login');
  }, [router]);

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await apiFetch<User & { id: string }>('/users/me');
      setUser(toUserInfo(profile));
    } catch {
      // apiFetch handles 401 redirect; other errors leave state unchanged.
    }
  }, []);

  const contextValue = useMemo(
    () => ({
      isAuthenticated: user !== null,
      isLoading: !hydrated,
      likelyAuthenticated,
      user,
      isAdmin: user?.role === Role.ADMIN,
      isDm: user?.role === Role.DUNGEON_MASTER || user?.role === Role.ADMIN,
      login,
      register,
      logout,
      refreshProfile,
    }),
    [user, hydrated, likelyAuthenticated, login, register, logout, refreshProfile]
  );

  // Render children immediately rather than blanking the tree until hydration
  // resolves. Public pages (/srd, /login) paint without waiting on a network
  // round-trip; identity-gated pages key off `isLoading` instead. (VEG-320)
  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
