'use client';

import { useState } from 'react';
import type { Character, CharacterResource, ResourceRecharge } from '@/lib/types';
import { RECHARGE_KINDS } from '@/lib/types';
import { parseNonNegativeInt, togglePip } from '@/lib/character-play';
import { addResource, editResource, removeResource } from '@/lib/character-resources';
import { resolvePlayControls, type PlayControlProps } from './useCharacterMutation';

type ResourceTrackerProps = { character: Character } & PlayControlProps;

/**
 * Limited-use resource tracker (VEG-409): player-defined pools (ki, rage,
 * sorcery points…) with a usage track per resource. Small pools (max ≤ 10)
 * render clickable pips like spell slots; larger pools fall back to the hit-die
 * −/+ counter idiom. Short/long rest recovery is dispatched from CombatBar's
 * rest buttons — this card owns spend/restore and the resource list itself.
 */

/** Pools up to this size render pips; larger ones get a −/+ counter. */
const PIP_LIMIT = 10;

const RECHARGE_LABELS: Record<ResourceRecharge, string> = {
  short: 'Short rest',
  long: 'Long rest',
};

interface ResourceFormState {
  name: string;
  max: string;
  recharge: ResourceRecharge;
}

const EMPTY_FORM: ResourceFormState = { name: '', max: '', recharge: 'short' };

export default function ResourceTracker(props: ResourceTrackerProps) {
  const { character } = props;
  const { editable, patch, isSaving } = resolvePlayControls(props);
  // Nullable column (VEG-425): legacy/minimal rows carry null.
  const resources = character.resources ?? [];

  const [addForm, setAddForm] = useState<ResourceFormState>(EMPTY_FORM);
  // Index of the row being edited, with its draft; null when no editor is open.
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<ResourceFormState>(EMPTY_FORM);

  // A viewer with nothing to see gets no empty card taking up sheet space.
  if (!editable && resources.length === 0) return null;

  const setUsed = (index: number, used: number) => {
    // editResource clamps used into 0..max — the single home for the rule, so
    // spend/restore is just a used write.
    patch({ resources: editResource(resources, index, { used }) });
  };

  const spend = (index: number, delta: number) => {
    setUsed(index, resources[index].used + delta);
  };

  const removeAt = (index: number) => {
    // The inline editor is keyed by index; removing any row shifts indexes
    // under it, so Save would silently overwrite a different resource once the
    // refetched list lands. Close it — removing mid-edit is rare.
    setEditIndex(null);
    patch({ resources: removeResource(resources, index) });
  };

  // Mirrors the backend ResourceDto bounds (name non-empty, max 1–99): the
  // HTML max attr doesn't block typed input, and a 400 would arrive after the
  // form already cleared.
  const isFormValid = (form: ResourceFormState) => {
    const max = parseNonNegativeInt(form.max);
    return form.name.trim().length > 0 && max >= 1 && max <= 99;
  };
  // Backend @ArrayMaxSize(30).
  const atResourceCap = resources.length >= 30;

  const submitAdd = () => {
    if (!isFormValid(addForm) || atResourceCap) return;
    patch({
      resources: addResource(resources, {
        name: addForm.name.trim(),
        max: parseNonNegativeInt(addForm.max),
        used: 0,
        recharge: addForm.recharge,
      }),
    });
    setAddForm(EMPTY_FORM);
  };

  const openEditor = (index: number) => {
    const r = resources[index];
    setEditIndex(index);
    setEditForm({ name: r.name, max: String(r.max), recharge: r.recharge });
  };

  const submitEdit = () => {
    if (editIndex === null || !isFormValid(editForm)) return;
    patch({
      resources: editResource(resources, editIndex, {
        name: editForm.name.trim(),
        max: parseNonNegativeInt(editForm.max),
        recharge: editForm.recharge,
      }),
    });
    setEditIndex(null);
  };

  const inputClass =
    'text-xs px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50';
  const iconButtonClass =
    'text-xs px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-50';
  const counterButtonClass =
    'w-6 h-6 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40';

  const renderTrack = (resource: CharacterResource, index: number) => {
    if (resource.max <= PIP_LIMIT) {
      return (
        <div className="flex items-center gap-1">
          {Array.from({ length: resource.max }, (_, i) => {
            const filled = i < resource.used;
            const shared = {
              'data-testid': `resource-${index}-pip-${i + 1}`,
              'data-filled': filled,
              // Fill colors match SpellcastingSection's slot pips so the two
              // diamond tracks read identically (incl. dark mode).
              className: `inline-block w-3 h-3 rotate-45 border text-[0] ${
                filled
                  ? 'bg-indigo-600 dark:bg-indigo-400 border-indigo-600 dark:border-indigo-400'
                  : 'bg-transparent border-gray-400 dark:border-gray-500'
              }`,
            };
            return editable ? (
              <button
                key={i}
                type="button"
                {...shared}
                aria-label={`${resource.name} use ${i + 1}`}
                aria-pressed={filled}
                disabled={isSaving}
                onClick={() => setUsed(index, togglePip(resource.used, i, resource.max))}
                className={`${shared.className} disabled:opacity-50`}
              />
            ) : (
              <span key={i} {...shared} />
            );
          })}
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        {editable && (
          <button
            type="button"
            aria-label={`Spend ${resource.name}`}
            disabled={isSaving || resource.used >= resource.max}
            onClick={() => spend(index, 1)}
            className={counterButtonClass}
          >
            −
          </button>
        )}
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {resource.max - resource.used}/{resource.max}
        </span>
        {editable && (
          <button
            type="button"
            aria-label={`Restore ${resource.name}`}
            disabled={isSaving || resource.used <= 0}
            onClick={() => spend(index, -1)}
            className={counterButtonClass}
          >
            +
          </button>
        )}
      </div>
    );
  };

  const renderForm = (
    form: ResourceFormState,
    setForm: (next: ResourceFormState) => void,
    labelPrefix: string
  ) => (
    <>
      <input
        type="text"
        aria-label={`${labelPrefix} name`}
        placeholder="Resource name"
        value={form.name}
        disabled={isSaving}
        onChange={e => setForm({ ...form, name: e.target.value })}
        className={`${inputClass} w-36`}
      />
      <input
        type="number"
        min={1}
        max={99}
        aria-label={`${labelPrefix} max`}
        placeholder="Max"
        value={form.max}
        disabled={isSaving}
        onChange={e => setForm({ ...form, max: e.target.value })}
        className={`${inputClass} w-16`}
      />
      <select
        aria-label={`${labelPrefix} recharge`}
        value={form.recharge}
        disabled={isSaving}
        onChange={e => setForm({ ...form, recharge: e.target.value as ResourceRecharge })}
        className={inputClass}
      >
        {RECHARGE_KINDS.map(kind => (
          <option key={kind} value={kind}>
            {RECHARGE_LABELS[kind]}
          </option>
        ))}
      </select>
    </>
  );

  return (
    <div
      data-testid="resource-tracker"
      className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <h2 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Resources</h2>

      {resources.length === 0 && (
        <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">No resources tracked</p>
      )}

      <ul className="mt-2 space-y-2">
        {resources.map((resource, index) => (
          <li key={`${resource.name}-${index}`} className="flex flex-wrap items-center gap-2">
            {editIndex === index ? (
              <>
                {renderForm(editForm, setEditForm, 'Edit resource')}
                <button
                  type="button"
                  aria-label="Save resource"
                  disabled={isSaving || !isFormValid(editForm)}
                  onClick={submitEdit}
                  className="text-xs px-1.5 py-0.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  aria-label="Cancel edit"
                  disabled={isSaving}
                  onClick={() => setEditIndex(null)}
                  className={iconButtonClass}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {resource.name}
                </span>
                <span
                  data-testid={`resource-${index}-recharge`}
                  className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                >
                  {RECHARGE_LABELS[resource.recharge]}
                </span>
                {renderTrack(resource, index)}
                {editable && (
                  <span className="flex items-center gap-1 ml-auto">
                    <button
                      type="button"
                      aria-label={`Edit ${resource.name}`}
                      disabled={isSaving}
                      onClick={() => openEditor(index)}
                      className={iconButtonClass}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${resource.name}`}
                      disabled={isSaving}
                      onClick={() => removeAt(index)}
                      className={iconButtonClass}
                    >
                      ✕
                    </button>
                  </span>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {editable && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {renderForm(addForm, setAddForm, 'New resource')}
          <button
            type="button"
            disabled={isSaving || !isFormValid(addForm) || atResourceCap}
            onClick={submitAdd}
            className="text-xs px-2 py-0.5 font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Add resource
          </button>
        </div>
      )}
    </div>
  );
}
