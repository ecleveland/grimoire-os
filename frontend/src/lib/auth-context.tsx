'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from './api';
import { disconnectSocket } from './socket';
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
    disconnectSocket();
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
      user,
      isAdmin: user?.role === Role.ADMIN,
      isDm: user?.role === Role.DUNGEON_MASTER || user?.role === Role.ADMIN,
      login,
      register,
      logout,
      refreshProfile,
    }),
    [user, login, register, logout, refreshProfile]
  );

  if (!hydrated) {
    return null;
  }

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
