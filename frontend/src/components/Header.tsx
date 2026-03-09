'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function Header() {
  const { isAuthenticated, user, isAdmin, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!isAuthenticated) return null;

  return (
    <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link href="/" className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
            GrimoireOS
          </Link>

          {/* Desktop nav */}
          <nav className="hidden sm:flex items-center gap-4">
            <Link href="/campaigns" className="text-sm text-gray-700 dark:text-gray-300 hover:text-indigo-600">
              Campaigns
            </Link>
            <Link href="/characters" className="text-sm text-gray-700 dark:text-gray-300 hover:text-indigo-600">
              Characters
            </Link>
            <Link href="/srd" className="text-sm text-gray-700 dark:text-gray-300 hover:text-indigo-600">
              SRD
            </Link>
            {isAdmin && (
              <Link href="/admin/users" className="text-sm text-gray-700 dark:text-gray-300 hover:text-indigo-600">
                Admin
              </Link>
            )}
            <Link href="/profile" className="text-sm text-gray-700 dark:text-gray-300 hover:text-indigo-600">
              {user?.displayName || user?.username}
            </Link>
            <button
              onClick={logout}
              className="text-sm text-red-600 hover:text-red-700"
            >
              Logout
            </button>
          </nav>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden p-2"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-gray-200 dark:border-gray-700 px-4 py-2 space-y-2">
          <Link href="/campaigns" className="block text-sm text-gray-700 dark:text-gray-300" onClick={() => setMenuOpen(false)}>Campaigns</Link>
          <Link href="/characters" className="block text-sm text-gray-700 dark:text-gray-300" onClick={() => setMenuOpen(false)}>Characters</Link>
          <Link href="/srd" className="block text-sm text-gray-700 dark:text-gray-300" onClick={() => setMenuOpen(false)}>SRD</Link>
          {isAdmin && (
            <Link href="/admin/users" className="block text-sm text-gray-700 dark:text-gray-300" onClick={() => setMenuOpen(false)}>Admin</Link>
          )}
          <Link href="/profile" className="block text-sm text-gray-700 dark:text-gray-300" onClick={() => setMenuOpen(false)}>Profile</Link>
          <button onClick={logout} className="block text-sm text-red-600">Logout</button>
        </div>
      )}
    </header>
  );
}
