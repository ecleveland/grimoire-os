'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import ConfirmDialog from '@/components/ConfirmDialog';
import AdminSubnav from '@/components/AdminSubnav';
import CoinRangeEditor from '@/components/CoinRangeEditor';
import LootItemsEditor from '@/components/LootItemsEditor';
import { LOOT_CR_BUCKETS } from '@grimoire-os/shared';
import type { LootTemplateCoinage, LootTemplateItemEntry } from '@grimoire-os/shared';

type TableSlug = 'names' | 'appearance' | 'loot-templates' | 'trinkets' | 'personality';

type AnyRow = {
  id: string;
  source?: string;
  isActive: boolean;
  [key: string]: unknown;
};

type FieldDef = {
  key: string;
  label: string;
  required?: boolean;
  kind?: 'text' | 'select' | 'coinage' | 'lootItems';
  options?: string[];
};

type FieldValue = string | LootTemplateCoinage | LootTemplateItemEntry[];
type FormState = Record<string, FieldValue>;

type TabConfig = {
  slug: TableSlug;
  label: string;
  columns: { key: string; label: string }[];
  fields: FieldDef[];
  hasSource: boolean;
};

const PERSONALITY_KINDS = ['personalityTraits', 'ideals', 'bonds', 'flaws'] as const;

const TABS: TabConfig[] = [
  {
    slug: 'names',
    label: 'Names',
    columns: [
      { key: 'race', label: 'Race' },
      { key: 'gender', label: 'Gender' },
      { key: 'kind', label: 'Kind' },
      { key: 'value', label: 'Value' },
    ],
    fields: [
      { key: 'race', label: 'Race', required: true },
      { key: 'gender', label: 'Gender (optional)' },
      {
        key: 'kind',
        label: 'Kind',
        required: true,
        kind: 'select',
        options: ['first', 'family', 'epithet'],
      },
      { key: 'value', label: 'Value', required: true },
    ],
    hasSource: true,
  },
  {
    slug: 'appearance',
    label: 'Appearance',
    columns: [
      { key: 'race', label: 'Race' },
      { key: 'category', label: 'Category' },
      { key: 'trait', label: 'Trait' },
    ],
    fields: [
      { key: 'race', label: 'Race', required: true },
      { key: 'category', label: 'Category', required: true },
      { key: 'trait', label: 'Trait', required: true },
    ],
    hasSource: true,
  },
  {
    slug: 'loot-templates',
    label: 'Loot Templates',
    columns: [
      { key: 'profession', label: 'Profession' },
      { key: 'crBucket', label: 'CR' },
    ],
    fields: [
      { key: 'profession', label: 'Profession', required: true },
      {
        key: 'crBucket',
        label: 'CR bucket',
        required: true,
        kind: 'select',
        options: [...LOOT_CR_BUCKETS],
      },
      { key: 'coinage', label: 'Coinage', required: true, kind: 'coinage' },
      { key: 'items', label: 'Items', required: true, kind: 'lootItems' },
    ],
    hasSource: true,
  },
  {
    slug: 'trinkets',
    label: 'Trinkets',
    columns: [{ key: 'description', label: 'Description' }],
    fields: [{ key: 'description', label: 'Description', required: true }],
    hasSource: true,
  },
  {
    slug: 'personality',
    label: 'Personality',
    columns: [
      { key: 'background', label: 'Background' },
      { key: 'kind', label: 'Kind' },
      { key: 'value', label: 'Value' },
    ],
    fields: [
      { key: 'background', label: 'Background', required: true },
      {
        key: 'kind',
        label: 'Kind',
        required: true,
        kind: 'select',
        options: [...PERSONALITY_KINDS],
      },
      { key: 'value', label: 'Value', required: true },
    ],
    hasSource: false,
  },
];

const inputClass =
  'w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

function emptyValue(field: FieldDef): FieldValue {
  if (field.kind === 'coinage') return { gp: [0, 0], sp: [0, 0], cp: [0, 0] };
  if (field.kind === 'lootItems') return [];
  return '';
}

function emptyForm(tab: TabConfig): FormState {
  return Object.fromEntries(tab.fields.map(f => [f.key, emptyValue(f)]));
}

function isDeletable(tab: TabConfig, row: AnyRow): boolean {
  if (!tab.hasSource) return true;
  return row.source === 'user';
}

export default function AdminNpcDataPage() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [activeSlug, setActiveSlug] = useState<TableSlug>('names');
  const tab = useMemo(() => TABS.find(t => t.slug === activeSlug) as TabConfig, [activeSlug]);
  const [rows, setRows] = useState<AnyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<FormState>(() => emptyForm(TABS[0]));
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingDelete, setPendingDelete] = useState<AnyRow | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/');
    }
  }, [isAdmin, router]);

  const load = useCallback(async (slug: TableSlug) => {
    setLoading(true);
    try {
      const data = await apiFetch<AnyRow[]>(`/admin/npc-data/${slug}`);
      setRows(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load rows');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    setForm(emptyForm(tab));
    setSearch('');
    void load(tab.slug);
  }, [isAdmin, tab, load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    for (const f of tab.fields) {
      const raw = form[f.key];
      if (f.kind === 'lootItems') {
        const items = raw as LootTemplateItemEntry[];
        if (f.required && items.length === 0) {
          toast.error('Add at least one item');
          return;
        }
        // All-zero weights would make the loot roller's weightedPick throw
        // at generation time; the backend rejects this too.
        if (items.length > 0 && !items.some(i => i.weight > 0)) {
          toast.error('At least one item needs a weight above 0');
          return;
        }
        body[f.key] = items;
        continue;
      }
      if (f.kind === 'coinage') {
        // The editor keeps every range valid by construction.
        body[f.key] = raw;
        continue;
      }
      const text = (raw as string) ?? '';
      if (f.required && text.trim() === '') {
        toast.error(`${f.label} is required`);
        return;
      }
      if (text === '') continue;
      body[f.key] = text;
    }
    setSubmitting(true);
    try {
      await apiFetch(`/admin/npc-data/${tab.slug}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      toast.success('Row added');
      setForm(emptyForm(tab));
      await load(tab.slug);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add row');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (row: AnyRow) => {
    try {
      await apiFetch(`/admin/npc-data/${tab.slug}/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !row.isActive }),
      });
      setRows(prev => prev.map(r => (r.id === row.id ? { ...r, isActive: !row.isActive } : r)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle row');
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await apiFetch(`/admin/npc-data/${tab.slug}/${target.id}`, { method: 'DELETE' });
      setRows(prev => prev.filter(r => r.id !== target.id));
      toast.success('Row deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete row');
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      tab.columns.some(c =>
        String(r[c.key] ?? '')
          .toLowerCase()
          .includes(q)
      )
    );
  }, [rows, search, tab.columns]);

  if (!isAdmin) return null;

  const addForm = (
    <form
      onSubmit={handleSubmit}
      aria-label={`Add ${tab.label.toLowerCase()} row`}
      className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3 mb-6"
    >
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add to {tab.label}</h2>
      {tab.fields.map(f => {
        const inputId = `npc-data-${tab.slug}-${f.key}`;
        const labelText = `${f.label}${f.required ? ' *' : ''}`;
        // The structured editors manage their own inputs, so they get a
        // heading instead of a control-bound <label>.
        if (f.kind === 'coinage' || f.kind === 'lootItems') {
          return (
            <div key={f.key}>
              <span className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                {labelText}
              </span>
              {f.kind === 'coinage' ? (
                <CoinRangeEditor
                  value={form[f.key] as LootTemplateCoinage}
                  onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))}
                />
              ) : (
                <LootItemsEditor
                  value={form[f.key] as LootTemplateItemEntry[]}
                  onChange={v => setForm(prev => ({ ...prev, [f.key]: v }))}
                />
              )}
            </div>
          );
        }
        const text = (form[f.key] as string) ?? '';
        return (
          <div key={f.key}>
            <label
              htmlFor={inputId}
              className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
            >
              {labelText}
            </label>
            {f.kind === 'select' && f.options ? (
              <select
                id={inputId}
                value={text}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                className={inputClass}
              >
                <option value="">Select…</option>
                {f.options.map(o => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={inputId}
                type="text"
                value={text}
                onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                className={inputClass}
              />
            )}
          </div>
        );
      })}
      <button
        type="submit"
        disabled={submitting}
        className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {submitting ? 'Adding…' : 'Add row'}
      </button>
    </form>
  );

  return (
    <div>
      <AdminSubnav />
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">NPC Reference Data</h1>

      <div className="flex flex-wrap gap-2 mb-4" role="tablist" aria-label="NPC data tables">
        {TABS.map(t => {
          const selected = t.slug === activeSlug;
          return (
            <button
              key={t.slug}
              role="tab"
              aria-selected={selected}
              onClick={() => {
                setActiveSlug(t.slug);
                // Reset synchronously: the structured editors render before
                // the tab-change effect fires and need this tab's defaults.
                setForm(emptyForm(t));
              }}
              className={`px-3 py-1.5 text-sm rounded-lg border ${
                selected
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {addForm}

      <input
        type="search"
        placeholder="Search…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className={`${inputClass} mb-4 max-w-sm`}
        aria-label="Search rows"
      />

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                {tab.columns.map(c => (
                  <th
                    key={c.key}
                    className="px-4 py-2 font-medium text-gray-700 dark:text-gray-200"
                  >
                    {c.label}
                  </th>
                ))}
                {tab.hasSource ? (
                  <th className="px-4 py-2 font-medium text-gray-700 dark:text-gray-200">Source</th>
                ) : null}
                <th className="px-4 py-2 font-medium text-gray-700 dark:text-gray-200">Active</th>
                <th className="px-4 py-2 font-medium text-gray-700 dark:text-gray-200 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={tab.columns.length + (tab.hasSource ? 3 : 2)}
                    className="px-4 py-6 text-center text-gray-500 dark:text-gray-400"
                  >
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={tab.columns.length + (tab.hasSource ? 3 : 2)}
                    className="px-4 py-6 text-center text-gray-500 dark:text-gray-400"
                  >
                    No rows.
                  </td>
                </tr>
              ) : (
                filtered.map(r => (
                  <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700">
                    {tab.columns.map(c => (
                      <td key={c.key} className="px-4 py-2 text-gray-900 dark:text-gray-100">
                        {formatCell(r[c.key])}
                      </td>
                    ))}
                    {tab.hasSource ? (
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                        {String(r.source ?? 'user')}
                      </td>
                    ) : null}
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                          r.isActive
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {r.isActive ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right space-x-2">
                      <button
                        onClick={() => toggleActive(r)}
                        className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        {r.isActive ? 'Disable' : 'Enable'}
                      </button>
                      {isDeletable(tab, r) ? (
                        <button
                          onClick={() => setPendingDelete(r)}
                          className="text-xs px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30"
                        >
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={open => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete row"
        description="This permanently removes the row from the reference table."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
