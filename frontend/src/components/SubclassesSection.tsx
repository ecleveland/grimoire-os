'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Badge from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import FeatureChips from '@/components/FeatureChips';
import Skeleton from '@/components/Skeleton';
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
 * One opening of a form. One slot, because an open form holds an unsaved draft
 * in its own state: while a form is open, every control that would unmount it
 * (Add, and the rows' Edit and Delete) is withdrawn, so save and cancel are the
 * only ways out.
 *
 * Each opening is a fresh object and is compared by reference, not by kind and
 * id. A write started from one opening must not close or disable a later
 * opening of the same form, and those two are equal in every field.
 */
type FormOpening = { kind: 'create' } | { kind: 'edit'; id: string };
type CreateOpening = Extract<FormOpening, { kind: 'create' }>;
type EditOpening = Extract<FormOpening, { kind: 'edit' }>;

interface SubclassesSectionProps {
  cls: SrdClass;
  subclasses: SrdSubclass[];
}

/**
 * The subclass list on a class page, plus the inline authoring controls. Any
 * signed-in user may add a subclass to a class they can see; editing and
 * deleting follow the same ownership rule the class header uses.
 *
 * The rows come from the class query rather than a query of its own, so a write
 * refreshes by invalidating that query and the standalone subclass lists the
 * character pickers read.
 */
export default function SubclassesSection({ cls, subclasses }: SubclassesSectionProps) {
  const { isAdmin, isAuthenticated, isLoading, likelyAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const [openForm, setOpenForm] = useState<FormOpening | null>(null);
  // The opening whose create or update is in flight. Only that form shows it.
  const [submittingForm, setSubmittingForm] = useState<FormOpening | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<SrdSubclass | null>(null);
  // Rows whose card can't be trusted yet: a DELETE in flight, or a save that has
  // landed while the refetch carrying its new values is still out. Their Edit and
  // Delete stay withdrawn until that settles, so nothing re-deletes a row or seeds
  // an edit from the values a save just replaced. One entry per mark, since a
  // save and a delete can both be pending for the same row.
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const markPending = (id: string) => setPendingIds(prev => [...prev, id]);
  const clearPending = (id: string) =>
    setPendingIds(prev => {
      const at = prev.indexOf(id);
      return at === -1 ? prev : [...prev.slice(0, at), ...prev.slice(at + 1)];
    });

  // Same hint CreateEntityLink reads: while the session hydrates, a browser that
  // was signed in keeps the section's place instead of popping it in afterwards.
  const hydratingSignedIn = isLoading && likelyAuthenticated;

  // Nothing to show and nothing to offer, so the section stays off the page.
  if (subclasses.length === 0 && !isAuthenticated && !hydratingSignedIn) return null;

  // An edit whose row has left the list, deleted from another tab say, has
  // nothing to save to. Reading it as no form hands the controls back rather
  // than withdrawing them for good.
  const activeForm =
    openForm?.kind === 'edit' && !subclasses.some(sc => sc.id === openForm.id) ? null : openForm;

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

  /**
   * Save from one form opening, then toast, close that opening and refresh. The
   * form stays open on failure. The author may cancel and open another form
   * while this is in flight, so everything here touches only `form`.
   */
  const submit = async (
    form: FormOpening,
    sentName: string | undefined,
    send: () => Promise<unknown>
  ) => {
    // Read off the opening, so the copy can't disagree with the form that saved.
    const created = form.kind === 'create';
    // An edit that keeps the name doesn't send it, so the toast names the row.
    const name =
      sentName ??
      (form.kind === 'edit' ? subclasses.find(sc => sc.id === form.id)?.name : undefined) ??
      'subclass';
    setSubmittingForm(form);
    try {
      await send();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : `Failed to ${created ? 'create' : 'update'} subclass`
      );
      return;
    } finally {
      // Only this opening. Another form may have been opened and submitted since,
      // and it is still saving.
      setSubmittingForm(prev => (prev === form ? null : prev));
    }
    toast.success(`${created ? 'Created' : 'Updated'} ${name}`);
    // Marked in the same render that closes the form, so the saved row's card
    // never offers Edit while it still shows the values from before the save.
    const savedRowId = form.kind === 'edit' ? form.id : null;
    if (savedRowId) markPending(savedRowId);
    setOpenForm(prev => (prev === form ? null : prev));
    try {
      await refresh();
    } finally {
      if (savedRowId) clearPending(savedRowId);
    }
  };

  const handleCreate = (form: CreateOpening, payload: SubclassPayload) =>
    submit(form, payload.name, () =>
      apiFetch('/srd/subclasses', {
        method: 'POST',
        body: JSON.stringify({ ...payload, classId: cls.id }),
      })
    );

  // The row id comes off the opening too, so the PATCH can't target a different
  // row from the form that sent it.
  const handleEdit = (form: EditOpening, payload: SubclassPayload) =>
    submit(form, payload.name, () =>
      apiFetch(`/srd/subclasses/${form.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    );

  // Kept apart from `submit`: a delete has no form, so it must neither close nor
  // disable whichever form happens to be open when it lands.
  const handleDelete = async (sc: SrdSubclass) => {
    markPending(sc.id);
    try {
      await apiFetch(`/srd/subclasses/${sc.id}`, { method: 'DELETE' });
      toast.success(`Deleted ${sc.name}`);
      // Awaited while the row is still marked, so its controls stay withdrawn
      // until the refetch drops it and it can't be deleted twice.
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete subclass');
    } finally {
      clearPending(sc.id);
    }
  };

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
              {activeForm?.kind === 'edit' && activeForm.id === sc.id ? (
                <SubclassForm
                  initial={sc}
                  submitting={submittingForm === activeForm}
                  submitLabel="Save changes"
                  onSubmit={payload => handleEdit(activeForm, payload)}
                  onCancel={() => setOpenForm(null)}
                />
              ) : (
                <SubclassCard
                  sc={sc}
                  canManage={canManage(sc) && activeForm === null && !pendingIds.includes(sc.id)}
                  onEdit={() => setOpenForm({ kind: 'edit', id: sc.id })}
                  onDelete={() => setConfirmingDelete(sc)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {activeForm?.kind === 'create' && (
        <div className={`${cardClass} mt-3`}>
          <SubclassForm
            submitting={submittingForm === activeForm}
            submitLabel="Create subclass"
            onSubmit={payload => handleCreate(activeForm, payload)}
            onCancel={() => setOpenForm(null)}
          />
        </div>
      )}
      {activeForm === null &&
        (isAuthenticated ? (
          <button
            type="button"
            onClick={() => setOpenForm({ kind: 'create' })}
            className={`${controlClass} mt-3`}
          >
            Add subclass
          </button>
        ) : (
          hydratingSignedIn && <Skeleton className="h-9 w-32 mt-3" />
        ))}

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
