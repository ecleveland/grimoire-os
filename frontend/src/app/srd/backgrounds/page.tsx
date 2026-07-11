'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery, invalidateApiPath } from '@/lib/query';
import Collapsible from '@/components/Collapsible';
import PrintToggle from '@/components/PrintToggle';
import CreateEntityLink from '@/components/CreateEntityLink';
import ConfirmDialog from '@/components/ConfirmDialog';
import Badge from '@/components/Badge';
import type { SrdBackground } from '@/lib/types';

/**
 * Background list (VEG-431). A client page (not the former SSR render): the
 * caller's homebrew backgrounds ride along with the catalog, so the fetch must
 * carry their credentials — the same reason the feats list is client-side.
 */
export default function BackgroundListPage() {
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const backgroundsQuery = useApiQuery<SrdBackground[]>('/srd/backgrounds', {
    errorToast: { message: 'Failed to load backgrounds', id: 'load-backgrounds' },
  });
  const [pendingDelete, setPendingDelete] = useState<SrdBackground | null>(null);

  // The owner may edit/delete their homebrew; admins curate shared content.
  const canManage = (bg: SrdBackground) =>
    (bg.contentSource === 'homebrew' && bg.createdById === user?.userId) ||
    (bg.contentSource === 'shared' && isAdmin);

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await apiFetch(`/srd/backgrounds/${pendingDelete.id}`, { method: 'DELETE' });
      toast.success(`Deleted ${pendingDelete.name}`);
      await invalidateApiPath(queryClient, '/srd/backgrounds');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete background');
    }
  }

  if (backgroundsQuery.isError) {
    return (
      <div className="text-red-600 dark:text-red-400">
        Failed to load backgrounds. Please try again later.
      </div>
    );
  }

  const backgrounds = backgroundsQuery.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Backgrounds</h1>
        <CreateEntityLink href="/srd/backgrounds/new" label="Create background" />
      </div>
      {backgroundsQuery.isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading backgrounds…</p>
      ) : (
        <div className="space-y-4">
          {backgrounds.map(bg => (
            <Collapsible
              key={bg.id}
              summary={
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {bg.name}
                    {bg.contentSource === 'homebrew' && (
                      <Badge variant="homebrew" className="ml-2 inline-block align-middle">
                        Homebrew
                      </Badge>
                    )}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Skills: {bg.skillProficiencies.join(', ')}
                    {bg.originFeat && (
                      <>
                        {' '}
                        &middot; Feat: {bg.originFeat.name}
                        {bg.originFeatOption && <> ({bg.originFeatOption})</>}
                      </>
                    )}
                  </p>
                </div>
              }
              headerAside={
                <PrintToggle
                  type="background"
                  id={bg.id}
                  name={bg.name}
                  className="mr-4 shrink-0"
                />
              }
            >
              {bg.description && (
                <p className="text-gray-600 dark:text-gray-400 text-sm">{bg.description}</p>
              )}
              {bg.abilityScores && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Ability Scores
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Choose {bg.abilityScores.choose} from: {bg.abilityScores.options.join(', ')}
                  </p>
                </div>
              )}
              {bg.toolProficiencies.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Tool Proficiencies
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {bg.toolProficiencies.join(', ')}
                  </p>
                </div>
              )}
              {canManage(bg) && (
                <div className="flex items-center gap-2 pt-2">
                  <Link
                    href={`/srd/backgrounds/${bg.id}/edit`}
                    className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(bg)}
                    className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </Collapsible>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={open => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete background?"
        description={`"${pendingDelete?.name ?? 'This background'}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete background"
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}
