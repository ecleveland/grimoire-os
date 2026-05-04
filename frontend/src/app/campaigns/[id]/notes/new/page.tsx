'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { Note } from '@/lib/types';
import FormField from '@/components/FormField';

export default function NewNotePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState<Note['visibility']>('private');
  const [sessionNumber, setSessionNumber] = useState('');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const note = await apiFetch<Note>('/notes', {
        method: 'POST',
        body: JSON.stringify({
          campaignId: id,
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
      toast.success('Note created!');
      router.push(`/campaigns/${id}/notes/${note.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create note');
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Create Note</h1>
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
          placeholder="lore, quest, npc"
        />
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Creating...' : 'Create Note'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
