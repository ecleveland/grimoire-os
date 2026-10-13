'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { parseIntInRange } from '@/lib/form-helpers';
import { apiQueryKey, invalidateApiPath, useApiMutation, useApiQuery } from '@/lib/query';
import type { Note } from '@/lib/types';
import FormField from '@/components/FormField';
import LoadError from '@/components/LoadError';
import LoadingState from '@/components/LoadingState';

const visibilityColors: Record<string, string> = {
  private: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  party: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  dm_only: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
};

interface NoteUpdate {
  title: string;
  content: string;
  visibility: Note['visibility'];
  sessionNumber: number | null;
  tags: string[];
}

export default function NoteDetailPage() {
  const { id, noteId } = useParams<{ id: string; noteId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const detailPath = `/notes/${noteId}`;

  const query = useApiQuery<Note | null>(detailPath, { errorToast: 'Failed to load note' });

  const save = useApiMutation(
    (body: NoteUpdate) =>
      apiFetch<Note>(detailPath, { method: 'PATCH', body: JSON.stringify(body) }),
    {
      onSuccess: updated => {
        queryClient.setQueryData(apiQueryKey(detailPath), updated);
        void invalidateApiPath(queryClient, '/notes?');
        setEditing(false);
        toast.success('Note updated!');
      },
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to update note');
      },
    }
  );

  const note = query.data;
  const isAuthor = note && user && note.authorId === user.userId;

  // The API answers a note the caller can't see, or one that is gone, with an
  // empty body, which reads as null. A cached null that is being refetched
  // falls through to the loading view instead of flashing this.
  if (note === null && !query.isFetching)
    return <div className="text-gray-500 dark:text-gray-400">Note not found.</div>;

  // The failure view is only for a note that never loaded. A reload that fails
  // in the background keeps the note on screen, and the error toast still
  // reports the failure. A retry in flight falls through to the loading view.
  if (query.isError && note === undefined && !query.isFetching)
    return <LoadError message="Failed to load note." onRetry={() => query.refetch()} />;

  if (note == null) return <LoadingState />;

  if (editing) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Note</h1>
        <NoteEditForm
          initial={note}
          submitting={save.isPending}
          onSubmit={body => save.mutate(body)}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-4">
        <button
          onClick={() => router.push(`/campaigns/${id}`)}
          className="text-sm text-indigo-600 hover:text-indigo-700"
        >
          &larr; Back to Campaign
        </button>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{note.title}</h1>
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${visibilityColors[note.visibility] || ''}`}
            >
              {note.visibility}
            </span>
            {isAuthor && (
              <button
                onClick={() => setEditing(true)}
                className="text-sm text-indigo-600 hover:text-indigo-700"
              >
                Edit
              </button>
            )}
          </div>
        </div>
        {note.sessionNumber != null && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Session {note.sessionNumber}
          </p>
        )}
        {note.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {note.tags.map(t => (
              <span
                key={t}
                className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded"
              >
                {t}
              </span>
            ))}
          </div>
        )}
        <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
          {note.content}
        </div>
      </div>
    </div>
  );
}

function NoteEditForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial: Note;
  submitting: boolean;
  onSubmit: (body: NoteUpdate) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [content, setContent] = useState(initial.content);
  const [visibility, setVisibility] = useState<Note['visibility']>(initial.visibility);
  const [sessionNumber, setSessionNumber] = useState(
    initial.sessionNumber != null ? String(initial.sessionNumber) : ''
  );
  const [tags, setTags] = useState(initial.tags.join(', '));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      title,
      content,
      visibility,
      sessionNumber: parseIntInRange(sessionNumber, 1),
      tags: tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean),
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <FormField
        label="Title"
        type="text"
        required
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      <FormField
        as="textarea"
        label="Content"
        rows={8}
        required
        value={content}
        onChange={e => setContent(e.target.value)}
      />
      <FormField
        as="select"
        label="Visibility"
        value={visibility}
        onChange={e => setVisibility(e.target.value as Note['visibility'])}
      >
        <option value="private">Private</option>
        <option value="party">Party</option>
        <option value="dm_only">DM Only</option>
      </FormField>
      <FormField
        label="Session Number"
        type="number"
        value={sessionNumber}
        onChange={e => setSessionNumber(e.target.value)}
      />
      <FormField
        label="Tags (comma-separated)"
        type="text"
        value={tags}
        onChange={e => setTags(e.target.value)}
      />
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
