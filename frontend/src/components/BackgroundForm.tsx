'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import FormField from '@/components/FormField';
import SrdCombobox from '@/components/SrdCombobox';
import ToggleChips from '@/components/ToggleChips';
import TokenListEditor from '@/components/TokenListEditor';
import { useApiQueryAll } from '@/lib/query';
import { SKILL_NAMES } from '@/lib/dnd-constants';
import type { SrdBackground, SrdFeat } from '@/lib/types';
import {
  emptyBackgroundFormState,
  backgroundToFormState,
  formStateToPayload,
  type BackgroundFormState,
  type BackgroundPayload,
} from '@/lib/background-form';

interface BackgroundFormProps {
  /** When set, the form starts prefilled (edit mode). */
  initial?: SrdBackground;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (payload: BackgroundPayload) => void;
  onCancel: () => void;
}

/**
 * Create/edit form for homebrew backgrounds (VEG-431), shared by the new and
 * edit pages. Validation and payload mapping live in `lib/background-form`;
 * the first error is surfaced as a toast.
 *
 * The origin-feat combobox is fed by the credentialed feat list, so it offers
 * the SRD catalog plus the caller's own homebrew feats — the id is only set by
 * an explicit pick, and editing the name afterwards clears it.
 */
export default function BackgroundForm({
  initial,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: BackgroundFormProps) {
  const [form, setForm] = useState<BackgroundFormState>(() =>
    initial ? backgroundToFormState(initial) : emptyBackgroundFormState()
  );

  // Every page of the catalog: a capped single page would silently make feats
  // past the cap unpickable (and un-editable on a background linked to one).
  const featsQuery = useApiQueryAll<SrdFeat>('/srd/feats?limit=100', {
    errorToast: { message: 'Failed to load feats', id: 'load-origin-feats' },
  });
  const featOptions = (featsQuery.data ?? []).map(f => ({ id: f.id, name: f.name }));
  // The already-linked feat is always a valid option, even while the list is
  // still loading (or if it somehow drops out of the fetched set) — otherwise
  // one keystroke during load would invalidate a legitimate prefilled pick.
  if (initial?.originFeat && !featOptions.some(o => o.id === initial.originFeat?.id)) {
    featOptions.push({ id: initial.originFeat.id, name: initial.originFeat.name });
  }

  const update = <K extends keyof BackgroundFormState>(key: K, value: BackgroundFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  // Point the origin-feat link at (name, resolved id) and reset the option
  // whenever the feat actually changes to a *different* one — an option is
  // specific to a feat, so carrying the old one onto a newly-picked feat would
  // render e.g. "Alert (Cleric)" for an option that only ever belonged to Magic
  // Initiate. A null id (an incomplete/ambiguous type) leaves the option parked:
  // a transient no-match mid-type mustn't wipe a still-valid option, and
  // formStateToPayload drops the option anyway when the id ends up null.
  const setOriginFeat = (name: string, id: string | null) => {
    setForm(prev => ({
      ...prev,
      originFeatName: name,
      originFeatId: id,
      originFeatOption: id !== null && id !== prev.originFeatId ? '' : prev.originFeatOption,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = formStateToPayload(form);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    onSubmit(result.payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="space-y-4">
        <FormField
          label="Name"
          required
          value={form.name}
          onChange={e => update('name', e.target.value)}
        />
        <FormField
          as="textarea"
          label="Description"
          rows={4}
          value={form.description}
          onChange={e => update('description', e.target.value)}
        />
      </section>

      <section className="space-y-4">
        {/* Canonical 5e skills only (VEG-474): a controlled toggle group replaces
            free text so a typo can't silently fail to match downstream. */}
        <ToggleChips
          label="Skill proficiencies"
          options={SKILL_NAMES}
          value={form.skillProficiencies}
          onChange={next => update('skillProficiencies', next)}
          helperText="Select the skills this background grants."
        />
        {/* Tools have no canonical seed list (VEG-474), so they stay open-ended
            chips — better than a textarea, but still free-typed. */}
        <TokenListEditor
          label="Tool proficiencies"
          value={form.toolProficiencies}
          onChange={next => update('toolProficiencies', next)}
          placeholder="Thieves' Tools, Mason's Tools…"
          helperText="Type a tool and press Enter or Add."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField
            label="Languages"
            type="number"
            min={0}
            helperText="Number of additional languages granted"
            value={form.languages}
            onChange={e => update('languages', e.target.value)}
          />
          <FormField
            label="Equipment"
            placeholder="A shovel, a set of common clothes…"
            value={form.equipment}
            onChange={e => update('equipment', e.target.value)}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SrdCombobox
          label="Origin feat"
          value={form.originFeatName}
          onChange={v => {
            // Typing binds to the id only while the text names exactly one
            // option (an SRD and a homebrew feat may share a name — an
            // ambiguous match must be resolved by an explicit pick).
            const matches = featOptions.filter(o => o.name === v.trim());
            setOriginFeat(v, matches.length === 1 ? matches[0].id : null);
          }}
          onSelect={o => setOriginFeat(o.name, o.id)}
          options={featOptions}
          loading={featsQuery.isLoading}
          placeholder="Search feats…"
          helperText="An SRD feat or one of your homebrew feats"
        />
        <FormField
          label="Origin feat option"
          placeholder="Cleric"
          helperText="For parameterized feats like Magic Initiate"
          value={form.originFeatOption}
          onChange={e => update('originFeatOption', e.target.value)}
        />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField
          as="textarea"
          label="Personality traits"
          helperText="One per line"
          rows={4}
          value={form.personalityTraits}
          onChange={e => update('personalityTraits', e.target.value)}
        />
        <FormField
          as="textarea"
          label="Ideals"
          helperText="One per line"
          rows={4}
          value={form.ideals}
          onChange={e => update('ideals', e.target.value)}
        />
        <FormField
          as="textarea"
          label="Bonds"
          helperText="One per line"
          rows={4}
          value={form.bonds}
          onChange={e => update('bonds', e.target.value)}
        />
        <FormField
          as="textarea"
          label="Flaws"
          helperText="One per line"
          rows={4}
          value={form.flaws}
          onChange={e => update('flaws', e.target.value)}
        />
      </section>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Saving...' : submitLabel}
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
