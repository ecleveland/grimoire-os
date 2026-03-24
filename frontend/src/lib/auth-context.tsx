'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from './api';
import type { User } from './types';

interface UserInfo {
  userId: string;
  username: string;
  role: 'player' | 'dungeon_master' | 'admin';
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
  logout: () => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

function parseJwt(token: string): {
  sub: string;
  username: string;
  role: string;
} {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(jsonPayload);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const router = useRouter();

  /* eslint-disable react-hooks/set-state-in-effect -- Hydrating from localStorage on mount is intentional */
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      setIsAuthenticated(true);
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser) as UserInfo);
        } catch {
          localStorage.removeItem('user');
        }
      }
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const fetchAndStoreProfile = useCallback(
    async (tokenPayload: { sub: string; username: string; role: string }) => {
      try {
        const profile = await apiFetch<User>('/users/me');
        const userInfo: UserInfo = {
          userId: tokenPayload.sub,
          username: tokenPayload.username,
          role: tokenPayload.role as UserInfo['role'],
          displayName: profile.displayName,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
        };
        localStorage.setItem('user', JSON.stringify(userInfo));
        setUser(userInfo);
      } catch {
        const userInfo: UserInfo = {
          userId: tokenPayload.sub,
          username: tokenPayload.username,
          role: tokenPayload.role as UserInfo['role'],
        };
        localStorage.setItem('user', JSON.stringify(userInfo));
        setUser(userInfo);
      }
    },
    []
  );

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        throw new Error('Invalid credentials');
      }

      const data = await res.json();
      localStorage.setItem('token', data.access_token);
      document.cookie = 'auth-flag=1; path=/; SameSite=Lax';
      setIsAuthenticated(true);

      const payload = parseJwt(data.access_token);
      await fetchAndStoreProfile(payload);
      router.push('/');
    },
    [router, fetchAndStoreProfile]
  );

  const register = useCallback(
    async (data: { username: string; password: string; displayName?: string; email?: string }) => {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Registration failed');
      }

      const responseData = await res.json();
      localStorage.setItem('token', responseData.access_token);
      document.cookie = 'auth-flag=1; path=/; SameSite=Lax';
      setIsAuthenticated(true);

      const payload = parseJwt(responseData.access_token);
      await fetchAndStoreProfile(payload);
      router.push('/');
    },
    [router, fetchAndStoreProfile]
  );

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    document.cookie = 'auth-flag=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    setIsAuthenticated(false);
    setUser(null);
    router.push('/login');
  }, [router]);

  const refreshProfile = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const payload = parseJwt(token);
    await fetchAndStoreProfile(payload);
  }, [fetchAndStoreProfile]);

  const contextValue = useMemo(
    () => ({
      isAuthenticated,
      user,
      isAdmin: user?.role === 'admin',
      isDm: user?.role === 'dungeon_master' || user?.role === 'admin',
      login,
      register,
      logout,
      refreshProfile,
    }),
    [isAuthenticated, user, login, register, logout, refreshProfile]
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
