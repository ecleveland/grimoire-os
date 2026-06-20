'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import FormField from '@/components/FormField';
import ShopStockEditor from '@/components/ShopStockEditor';
import { SHOP_THEMES } from '@/lib/shop-display';
import type { ShopLineItem } from '@/lib/types';

export interface ShopFormValues {
  name: string;
  theme: string;
  description: string;
  icon: string;
  accent: string;
  isOpen: boolean;
  items: ShopLineItem[];
}

export const EMPTY_SHOP_FORM: ShopFormValues = {
  name: '',
  theme: SHOP_THEMES[0],
  description: '',
  icon: '',
  accent: '',
  isOpen: true,
  items: [],
};

/**
 * Shape a form's values into a Shop request body. Blank optional strings are
 * sent as `null` so a cleared field clears server-side; `items` is sent as-is
 * (the structured ShopLineItem[] the backend persists). `campaignId` is added
 * by the create page (it's immutable, so the edit page omits it).
 */
export function toShopBody(values: ShopFormValues) {
  return {
    name: values.name.trim(),
    theme: values.theme,
    description: values.description.trim() || null,
    icon: values.icon.trim() || null,
    accent: values.accent.trim() || null,
    isOpen: values.isOpen,
    items: values.items,
  };
}

interface Props {
  initial: ShopFormValues;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (values: ShopFormValues) => void;
  onCancel: () => void;
  /**
   * Optional theme→stock suggester (VEG-355). When provided, a "Suggest stock"
   * button appears above the editor; its results are appended (deduped by
   * itemId) so a DM's existing edits are never clobbered. Omitted on the edit
   * page, where pre-filling an established shop would be surprising.
   */
  onSuggestStock?: (theme: string) => Promise<ShopLineItem[]>;
}

/**
 * Shared DM create/edit form for a campaign shop (VEG-354): identity (name,
 * theme, optional icon/accent overrides, open toggle), flavor description, and
 * the line-item stock editor. Presentational — the page owns the request.
 */
export default function ShopForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
  onSuggestStock,
}: Props) {
  const [values, setValues] = useState<ShopFormValues>(initial);
  const [suggesting, setSuggesting] = useState(false);
  // Bumped whenever suggestions are appended, to remount ShopStockEditor so it
  // re-seeds its per-line keys for the externally-grown list (the editor only
  // tracks keys for lines added through its own handlers).
  const [stockVersion, setStockVersion] = useState(0);

  const update = <K extends keyof ShopFormValues>(key: K, value: ShopFormValues[K]) =>
    setValues(prev => ({ ...prev, [key]: value }));

  const nameValid = values.name.trim().length > 0;

  const handleSuggest = async () => {
    if (!onSuggestStock || suggesting) return;
    setSuggesting(true);
    try {
      const suggested = await onSuggestStock(values.theme);
      // Append only catalog-linked suggestions not already stocked (dedupe by
      // itemId, matching the editor's own catalog-dedupe).
      const stocked = new Set(values.items.map(i => i.itemId).filter(Boolean));
      const additions = suggested.filter(s => s.itemId && !stocked.has(s.itemId));
      if (additions.length === 0) {
        toast.info(`No new stock to suggest for "${values.theme}".`);
        return;
      }
      setValues(prev => ({ ...prev, items: [...prev.items, ...additions] }));
      setStockVersion(v => v + 1);
      toast.success(
        `Added ${additions.length} suggested item${additions.length === 1 ? '' : 's'}.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to suggest stock');
    } finally {
      setSuggesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameValid || submitting) return;
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormField
        label="Name"
        required
        value={values.name}
        onChange={e => update('name', e.target.value)}
      />

      <FormField
        as="select"
        label="Theme"
        required
        value={values.theme}
        onChange={e => update('theme', e.target.value)}
      >
        {SHOP_THEMES.map(t => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </FormField>

      <FormField
        as="textarea"
        label="Description"
        rows={3}
        helperText="Flavor shown to players on the storefront."
        value={values.description}
        onChange={e => update('description', e.target.value)}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          label="Icon"
          helperText="Emoji glyph; blank inherits the theme icon."
          value={values.icon}
          onChange={e => update('icon', e.target.value)}
        />
        <FormField
          label="Accent color"
          helperText="CSS color; blank inherits the theme accent."
          value={values.accent}
          onChange={e => update('accent', e.target.value)}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
        <input
          type="checkbox"
          checked={values.isOpen}
          onChange={e => update('isOpen', e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
        />
        Open to players
      </label>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300">Stock</h2>
          {onSuggestStock && (
            <button
              type="button"
              onClick={handleSuggest}
              disabled={suggesting}
              className="text-xs px-3 py-1.5 rounded-lg border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 disabled:opacity-50 transition-colors"
            >
              {suggesting ? 'Suggesting…' : `Suggest stock for ${values.theme}`}
            </button>
          )}
        </div>
        <ShopStockEditor
          key={stockVersion}
          value={values.items}
          onChange={items => update('items', items)}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={!nameValid || submitting}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
