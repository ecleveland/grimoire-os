'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useApiMutation, useDeleteMutation, useListQuery } from '@/lib/query';
import { toast } from 'sonner';
import Pagination from '@/components/Pagination';
import ConfirmDialog from '@/components/ConfirmDialog';
import AdminSubnav from '@/components/AdminSubnav';
import LoadingState from '@/components/LoadingState';
import LoadError from '@/components/LoadError';
import type { User, PaginatedResponse } from '@/lib/types';

const LIMIT = 20;

export default function AdminUsersPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; username: string } | null>(null);

  // The redirect waits for session hydration, because the pre-hydration
  // `isAdmin: false` would bounce a real admin on refresh.
  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);

  const list = useListQuery<User>(
    '/admin/users',
    { page, limit: LIMIT },
    { enabled: !authLoading && isAdmin, errorToast: 'Failed to load users' }
  );
  const users = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const lastPage = list.data?.lastPage ?? 1;

  const updateRole = useApiMutation(
    ({ userId, role }: { userId: string; role: User['role'] }) =>
      apiFetch(`/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }),
    {
      onSuccess: (_data, { userId, role }) => {
        // Every cached page gets the new role, not only the one on screen.
        queryClient.setQueriesData<PaginatedResponse<User>>(
          {
            predicate: q =>
              typeof q.queryKey[1] === 'string' && q.queryKey[1].startsWith('/admin/users?'),
          },
          prev =>
            prev && {
              ...prev,
              data: prev.data.map(u => (u.id === userId ? { ...u, role } : u)),
            }
        );
        toast.success('Role updated');
      },
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to update role');
      },
    }
  );

  const remove = useDeleteMutation({
    path: '/admin/users',
    invalidate: '/admin/users?',
    onDeleted: () => {
      toast.success('User deleted');
      // Deleting the only row on a later page steps back a page, so the admin
      // is not left on an empty page past the end.
      if (users.length === 1 && page > 1) setPage(p => p - 1);
    },
  });

  const confirmDelete = () => {
    if (!pendingDelete) return;
    remove.mutate(pendingDelete.id, {
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to delete user');
      },
    });
  };

  if (!isAdmin) return null;
  // A Retry after a failed load keeps status 'error' while it runs, so the
  // loading view checks isFetching as well as isPending.
  if (list.isPending || (list.isError && list.isFetching && !list.data))
    return <LoadingState label="Loading users..." />;
  if (list.isError && !list.data)
    return <LoadError message="Failed to load users" onRetry={list.refetch} />;

  const selectClass =
    'px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <div>
      <AdminSubnav />
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">User Management</h1>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Username</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
                  Display Name
                </th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Email</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Role</th>
                <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                  <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                    {u.username}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {u.displayName || '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{u.email || '-'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={e =>
                        updateRole.mutate({ userId: u.id, role: e.target.value as User['role'] })
                      }
                      className={selectClass}
                    >
                      <option value="player">Player</option>
                      <option value="dungeon_master">Dungeon Master</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setPendingDelete({ id: u.id, username: u.username })}
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
      <Pagination
        page={page}
        lastPage={lastPage}
        total={total}
        limit={LIMIT}
        onPageChange={setPage}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={open => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete user?"
        description={
          pendingDelete
            ? `Deleting "${pendingDelete.username}" permanently deletes everything they created: their campaigns (with all notes, encounters, and NPCs), their characters, their homebrew content, and anything they authored in other campaigns. This cannot be undone.`
            : ''
        }
        variant="danger"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
