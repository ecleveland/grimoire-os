'use client';

import { useRef, useState } from 'react';
import { CancelledError, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Badge from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import FeatureChips from '@/components/FeatureChips';
import Skeleton from '@/components/Skeleton';
import SubclassForm from '@/components/SubclassForm';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { invalidateApiPath } from '@/lib/query';
import type { SubclassPayload } from '@/lib/subclass-form';
import type { SrdClass, SrdSubclass } from '@/lib/types';

const cardClass =
  'bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4';
const controlClass =
  'px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors';

/**
 * Which form is open, and for which row. One slot, because an open form holds
 * an unsaved draft in its own state, so while a form is open every control that
 * would unmount it (Add, and the rows' Edit and Delete) is withdrawn. Save and
 * Cancel are the only ways out, and Cancel is withdrawn while the save is out.
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
  // Whether a create or update is in flight. Only one form is open at a time and
  // it can't be dismissed while its write is out, so a flag says everything a
  // per-opening slot used to. It also withdraws Add and the rows' controls on its
  // own, because the edited row can leave the list mid-save and take its form
  // with it, and a form opened in that window would mount already frozen.
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<SrdSubclass | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
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

  // The class detail query owns the rows on this page, so it is the one with an
  // observer here and the one whose failed refetch this reports. The list
  // endpoint has no observer on this page, and invalidating it just marks the
  // character builder's subclass pickers stale for their next mount. Both start
  // together, so a failure on the class query can't skip the pickers and leave
  // them serving the old rows for the rest of the session.
  const refresh = async () => {
    try {
      await Promise.all([
        invalidateApiPath(queryClient, `/srd/classes/${cls.id}`, { throwOnError: true }),
        invalidateApiPath(queryClient, '/srd/subclasses', { throwOnError: true }),
      ]);
    } catch (err) {
      // A later write's invalidation cancels this refetch rather than racing it,
      // and the newer one carries the rows, so a supersession is a refresh that
      // landed. Everything else is a refetch that never arrived.
      if (!(err instanceof CancelledError)) throw err;
    }
  };

  /**
   * Refresh after a write the server refused because the row is gone, deleted
   * from another tab say. The page still lists it, and without this nothing
   * refetches, so every retry answers the same 404. Keyed on 404 alone, because
   * 400 is also the validation pipe's answer to a name or feature the author can
   * still fix, and reloading the page under them would throw that work away.
   * This leaves a create under a class deleted elsewhere, which answers 400,
   * uncovered. A failure here is swallowed, since the write has already toasted.
   */
  const refreshIfTargetGone = async (err: unknown) => {
    if (!(err instanceof ApiError) || err.status !== 404) return;
    try {
      await refresh();
    } catch {
      // The page stays stale until the author reloads it.
    }
  };

  /**
   * Save from the open form, then toast, close it and refresh. The form stays
   * open on failure, and cannot be dismissed while the write is out, so the
   * form this started from is still the open one when it lands.
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
    setSubmitting(true);
    try {
      await send();
    } catch (err) {
      setSubmitting(false);
      toast.error(
        err instanceof Error ? err.message : `Failed to ${created ? 'create' : 'update'} subclass`
      );
      await refreshIfTargetGone(err);
      return;
    }
    setSubmitting(false);
    toast.success(`${created ? 'Created' : 'Updated'} ${name}`);
    // Marked in the same render that closes the form, so the saved row's card
    // never offers Edit while it still shows the values from before the save.
    const savedRowId = form.kind === 'edit' ? form.id : null;
    if (savedRowId) markPending(savedRowId);
    setOpenForm(null);
    try {
      await refresh();
    } catch {
      // The new values never arrived, so the card is a version behind. The mark
      // stays on until the author reloads, rather than handing back an Edit that
      // would seed from the values the save replaced.
      toast.error('Saved, but the page could not reload. Refresh to see the change.');
      return;
    }
    if (savedRowId) clearPending(savedRowId);
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
  const handleEdit = (form: EditOpening, payload: SubclassPayload): void => {
    // An untouched edit has nothing to change, and a PATCH with no fields would
    // still toast a save and refetch the page for it.
    if (Object.keys(payload).length === 0) {
      setOpenForm(null);
      return;
    }
    void submit(form, payload.name, () =>
      apiFetch(`/srd/subclasses/${form.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
    );
  };

  // Kept apart from `submit`, because a delete has no form, so it must neither
  // close nor disable whichever form happens to be open when it lands.
  const handleDelete = async (sc: SrdSubclass) => {
    // The row's buttons unmount in the same render that closes the confirmation,
    // so the dialog's focus restore finds nothing and focus would fall to the
    // body. The section heading is what the deleted row sat under.
    headingRef.current?.focus();
    markPending(sc.id);
    try {
      await apiFetch(`/srd/subclasses/${sc.id}`, { method: 'DELETE' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete subclass');
      await refreshIfTargetGone(err);
      clearPending(sc.id);
      return;
    }
    toast.success(`Deleted ${sc.name}`);
    try {
      // Awaited while the row is still marked, so its controls stay withdrawn
      // until the refetch drops it and it can't be deleted twice.
      await refresh();
    } catch {
      // The row is gone on the server but still listed here, so the mark stays
      // on rather than offering a Delete that would send a second DELETE.
      toast.error('Deleted, but the page could not reload. Refresh to see the change.');
      return;
    }
    clearPending(sc.id);
  };

  return (
    <section className="mt-8">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-xl font-semibold text-gray-900 dark:text-white"
      >
        Subclasses
      </h2>
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
                  submitting={submitting}
                  submitLabel="Save changes"
                  onSubmit={payload => handleEdit(activeForm, payload)}
                  onCancel={() => setOpenForm(null)}
                />
              ) : (
                <SubclassCard
                  sc={sc}
                  canManage={
                    canManage(sc) &&
                    activeForm === null &&
                    !submitting &&
                    !pendingIds.includes(sc.id)
                  }
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
            submitting={submitting}
            submitLabel="Create subclass"
            onSubmit={payload => handleCreate(activeForm, payload)}
            onCancel={() => setOpenForm(null)}
          />
        </div>
      )}
      {activeForm === null &&
        !submitting &&
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
