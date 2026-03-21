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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser) as UserInfo);
        setIsAuthenticated(true);
      } catch {
        localStorage.removeItem('user');
      }
    }
    setHydrated(true);
  }, []);

  const fetchAndStoreProfile = useCallback(
    async (baseInfo: { userId: string; username: string; role: string }) => {
      try {
        const profile = await apiFetch<User>('/users/me');
        const userInfo: UserInfo = {
          userId: baseInfo.userId,
          username: baseInfo.username,
          role: baseInfo.role as UserInfo['role'],
          displayName: profile.displayName,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
        };
        localStorage.setItem('user', JSON.stringify(userInfo));
        setUser(userInfo);
      } catch {
        const userInfo: UserInfo = {
          userId: baseInfo.userId,
          username: baseInfo.username,
          role: baseInfo.role as UserInfo['role'],
        };
        localStorage.setItem('user', JSON.stringify(userInfo));
        setUser(userInfo);
      }
    },
    [],
  );

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

      const data = await res.json();
      document.cookie = 'auth-flag=1; path=/; SameSite=Lax';
      setIsAuthenticated(true);

      await fetchAndStoreProfile(data);
      router.push('/');
    },
    [router, fetchAndStoreProfile],
  );

  const register = useCallback(
    async (data: {
      username: string;
      password: string;
      displayName?: string;
      email?: string;
    }) => {
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

      const responseData = await res.json();
      document.cookie = 'auth-flag=1; path=/; SameSite=Lax';
      setIsAuthenticated(true);

      await fetchAndStoreProfile(responseData);
      router.push('/');
    },
    [router, fetchAndStoreProfile],
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Continue with client-side cleanup even if the server call fails
    }
    localStorage.removeItem('user');
    document.cookie =
      'auth-flag=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    setIsAuthenticated(false);
    setUser(null);
    router.push('/login');
  }, [router]);

  const refreshProfile = useCallback(async () => {
    const storedUser = localStorage.getItem('user');
    if (!storedUser) return;
    try {
      const parsed = JSON.parse(storedUser) as UserInfo;
      await fetchAndStoreProfile(parsed);
    } catch {
      // If profile fetch fails, keep existing data
    }
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
    [isAuthenticated, user, login, register, logout, refreshProfile],
  );

  if (!hydrated) {
    return null;
  }

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
