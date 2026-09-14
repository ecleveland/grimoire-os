'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Badge from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import FeatureChips from '@/components/FeatureChips';
import SubclassForm from '@/components/SubclassForm';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { invalidateApiPath } from '@/lib/query';
import type { SubclassPayload } from '@/lib/subclass-form';
import type { SrdClass, SrdSubclass } from '@/lib/types';

const cardClass =
  'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4';
const controlClass =
  'px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors';

/**
 * Which form, if any, is open. One slot, because an open form holds an unsaved
 * draft in its own state: while it is set, every control that would unmount it
 * (Add, and the rows' Edit and Delete) is withdrawn, so save and cancel are the
 * only ways out.
 */
type OpenForm = { kind: 'create' } | { kind: 'edit'; id: string } | null;

interface SubclassesSectionProps {
  cls: SrdClass;
  subclasses: SrdSubclass[];
}

/**
 * The subclass list on a class page, plus the inline authoring controls
 * (VEG-509). Any signed-in user may add a subclass to a class they can see;
 * editing and deleting follow the same ownership rule the class header uses.
 *
 * The rows come from the class query rather than a query of its own, so a write
 * refreshes by invalidating that query and the standalone subclass lists the
 * character pickers read.
 */
export default function SubclassesSection({ cls, subclasses }: SubclassesSectionProps) {
  const { isAdmin, isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<SrdSubclass | null>(null);

  // Nothing to show and nothing to offer, so the section stays off the page.
  if (subclasses.length === 0 && !isAuthenticated) return null;

  // The owner may edit/delete their homebrew; admins curate shared content.
  const canManage = (sc: SrdSubclass) =>
    (sc.contentSource === 'homebrew' && sc.createdById === user?.userId) ||
    (sc.contentSource === 'shared' && isAdmin);

  const refresh = async () => {
    // The class detail query owns the rows on this page; the list endpoint backs
    // the character builder's subclass pickers.
    await invalidateApiPath(queryClient, `/srd/classes/${cls.id}`);
    await invalidateApiPath(queryClient, '/srd/subclasses');
  };

  /** Run a write, then toast and refresh. The form stays open on failure. */
  const write = async (
    verb: 'create' | 'update' | 'delete',
    name: string,
    send: () => Promise<unknown>
  ) => {
    setSubmitting(true);
    try {
      await send();
      toast.success(`${{ create: 'Created', update: 'Updated', delete: 'Deleted' }[verb]} ${name}`);
      // Only the verb that owns the open form closes it. A delete confirmed
      // before a form was opened can land after it, and closing the form there
      // would throw away a draft the author is still typing into.
      if (verb !== 'delete') setOpenForm(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${verb} subclass`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreate = (payload: SubclassPayload) =>
    write('create', payload.name, () =>
      apiFetch('/srd/subclasses', {
        method: 'POST',
        body: JSON.stringify({ ...payload, classId: cls.id }),
      })
    );

  const handleEdit = (sc: SrdSubclass, payload: SubclassPayload) =>
    write('update', payload.name, () =>
      apiFetch(`/srd/subclasses/${sc.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    );

  const handleDelete = (sc: SrdSubclass) =>
    write('delete', sc.name, () => apiFetch(`/srd/subclasses/${sc.id}`, { method: 'DELETE' }));

  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Subclasses</h2>
      {cls.subclassLevel != null && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Chosen at level {cls.subclassLevel}.
        </p>
      )}

      {subclasses.length > 0 && (
        <ul className="mt-3 space-y-3">
          {subclasses.map(sc => (
            <li key={sc.id} className={cardClass}>
              {openForm?.kind === 'edit' && openForm.id === sc.id ? (
                <SubclassForm
                  initial={sc}
                  submitting={submitting}
                  submitLabel="Save changes"
                  onSubmit={payload => handleEdit(sc, payload)}
                  onCancel={() => setOpenForm(null)}
                />
              ) : (
                <SubclassCard
                  sc={sc}
                  canManage={canManage(sc) && openForm === null}
                  onEdit={() => setOpenForm({ kind: 'edit', id: sc.id })}
                  onDelete={() => setConfirmingDelete(sc)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {openForm?.kind === 'create' && (
        <div className={`${cardClass} mt-3`}>
          <SubclassForm
            submitting={submitting}
            submitLabel="Create subclass"
            onSubmit={handleCreate}
            onCancel={() => setOpenForm(null)}
          />
        </div>
      )}
      {isAuthenticated && openForm === null && (
        <button
          type="button"
          onClick={() => setOpenForm({ kind: 'create' })}
          className={`${controlClass} mt-3`}
        >
          Add subclass
        </button>
      )}

      <ConfirmDialog
        open={confirmingDelete !== null}
        onOpenChange={open => !open && setConfirmingDelete(null)}
        title="Delete subclass?"
        description={`"${confirmingDelete?.name ?? ''}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete subclass"
        variant="danger"
        onConfirm={() => confirmingDelete && handleDelete(confirmingDelete)}
      />
    </section>
  );
}

interface SubclassCardProps {
  sc: SrdSubclass;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function SubclassCard({ sc, canManage, onEdit, onDelete }: SubclassCardProps) {
  // A row can reach here without its features array when the API breaks its
  // contract, and losing the whole card over that hides the rest of the subclass.
  const features = sc.features ?? [];

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {sc.name}
          {sc.contentSource === 'homebrew' && (
            <Badge variant="homebrew" className="ml-2 inline-block align-middle">
              Homebrew
            </Badge>
          )}
        </h3>
        {sc.description && (
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{sc.description}</p>
        )}
        <FeatureChips features={features} className="mt-2" />
      </div>
      {canManage && (
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={onEdit} className={controlClass}>
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
