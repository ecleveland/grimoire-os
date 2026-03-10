'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import type { User } from '@/lib/types';

export default function AdminUsersPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/');
      return;
    }
    apiFetch<User[]>('/admin/users')
      .then(setUsers)
      .catch(() => toast.error('Failed to load users'))
      .finally(() => setLoading(false));
  }, [isAdmin, router]);

  const updateRole = async (userId: string, role: User['role']) => {
    try {
      await apiFetch(`/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      toast.success('Role updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const deleteUser = async (userId: string, username: string) => {
    if (!confirm(`Are you sure you want to delete user "${username}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/admin/users/${userId}`, { method: 'DELETE' });
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success('User deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  if (!isAdmin) return null;
  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading users...</div>;

  const selectClass =
    'px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">User Management</h1>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Username</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Display Name</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Email</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Role</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">{u.username}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{u.displayName || '-'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{u.email || '-'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => updateRole(u.id, e.target.value as User['role'])}
                      className={selectClass}
                    >
                      <option value="player">Player</option>
                      <option value="dungeon_master">Dungeon Master</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => deleteUser(u.id, u.username)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
