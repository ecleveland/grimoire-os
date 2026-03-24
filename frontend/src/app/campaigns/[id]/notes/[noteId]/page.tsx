'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import type { Note } from '@/lib/types';

const visibilityColors: Record<string, string> = {
  private: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  party: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  dm_only: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
};

export default function NoteDetailPage() {
  const { id, noteId } = useParams<{ id: string; noteId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<Note['visibility']>('private');
  const [sessionNumber, setSessionNumber] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const isAuthor = note && user && note.authorId === user.userId;

  useEffect(() => {
    apiFetch<Note>(`/notes/${noteId}`)
      .then(n => {
        setNote(n);
        setTitle(n.title);
        setContent(n.content);
        setVisibility(n.visibility);
        setSessionNumber(n.sessionNumber != null ? String(n.sessionNumber) : '');
        setTags(n.tags.join(', '));
      })
      .catch(() => toast.error('Failed to load note'))
      .finally(() => setLoading(false));
  }, [noteId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const updated = await apiFetch<Note>(`/notes/${noteId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          content,
          visibility,
          sessionNumber: sessionNumber ? Number(sessionNumber) : undefined,
          tags: tags
            .split(',')
            .map(t => t.trim())
            .filter(Boolean),
        }),
      });
      setNote(updated);
      setEditing(false);
      toast.success('Note updated!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update note');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  if (!note) return <div className="text-gray-500 dark:text-gray-400">Note not found.</div>;

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  if (editing) {
    return (
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Note</h1>
        <form
          onSubmit={handleSave}
          className="space-y-5 bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Content
            </label>
            <textarea
              rows={8}
              required
              value={content}
              onChange={e => setContent(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Visibility
            </label>
            <select
              value={visibility}
              onChange={e => setVisibility(e.target.value as Note['visibility'])}
              className={inputClass}
            >
              <option value="private">Private</option>
              <option value="party">Party</option>
              <option value="dm_only">DM Only</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Session Number
            </label>
            <input
              type="number"
              value={sessionNumber}
              onChange={e => setSessionNumber(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              className={inputClass}
            />
          </div>
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
              onClick={() => setEditing(false)}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
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
