'use client';

import { useId, useRef, useState } from 'react';
import { classFeatureIdentity } from '@grimoire-os/shared';
import { clampIntToRange } from '@/lib/form-helpers';
import { MAX_LEVEL } from '@/lib/character-level';

const cell =
  'px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const labelClasses = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const rowLabel = 'block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5';
const moveButton =
  'text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 leading-none';

/**
 * A feature row as this editor owns it: no `id`.
 *
 * Deliberately not `ClassFeature`, which carries `id?: string` because API
 * responses populate it. `ClassFeatureDto` whitelists only name, level and
 * description under `forbidNonWhitelisted`, so a row that keeps its id 400s the
 * whole PATCH. Handing this editor the features straight off
 * `GET /srd/classes/:id` is the obvious wiring, and it would have failed on
 * every edit of an existing class while create-from-blank kept working — which
 * reads as intermittent rather than as a contract error.
 *
 * The contract: the caller maps API features into this shape on
 * load. The editor guarantees the other half — every row it emits carries
 * exactly these three fields, whatever it was handed.
 */
export interface ClassFeatureDraft {
  name: string;
  level: number;
  description?: string;
  /** API rows carry an id, and the write DTO refuses it. */
  id?: never;
}

const EMPTY_FEATURE: ClassFeatureDraft = { name: '', level: 1, description: '' };

/**
 * Indices of rows sharing a (name, level) pairing with another row.
 *
 * Blank names are skipped: a half-typed row is not yet a collision, and flagging
 * every fresh row the moment a second one is added would make the warning noise.
 */
function duplicateIndices(value: ClassFeatureDraft[]): Set<number> {
  const seen = new Map<string, number>();
  const dupes = new Set<number>();
  value.forEach((f, i) => {
    if (!f.name) return;
    const key = classFeatureIdentity(f);
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, i);
      return;
    }
    dupes.add(first);
    dupes.add(i);
  });
  return dupes;
}

/**
 * Strip a row to the three fields the write boundary accepts.
 *
 * Named fields, not a spread: a spread carries whatever keys the runtime object
 * actually has, and `tsc` cannot see the difference because spreading into an
 * object literal skips excess-property checking. Same guard the server's
 * `toFeatureRows` applies, for the same reason.
 */
function toDraft(f: ClassFeatureDraft): ClassFeatureDraft {
  return { name: f.name, level: f.level, description: f.description ?? '' };
}

interface ClassFeaturesEditorProps {
  value: ClassFeatureDraft[];
  onChange: (next: ClassFeatureDraft[]) => void;
}

/**
 * Repeating rows for a class's per-level features (VEG-507).
 *
 * A third repeating-row editor rather than a generalization, which is worth
 * justifying: `FeaturesEditor` holds the character sheet's
 * `{ name, source, description }` — no level, and `source` is its grouping key
 * on the sheet — while `WeaponsEditor` is a different row shape again. Neither
 * surfaces validation and neither reorders. VEG-336 item 3 still wants the
 * shared form controls pulled out of all three; that is the right place to merge
 * them, not here.
 *
 * **Row order is a drafting aid, not stored state.** Every read path returns
 * features ordered by `(level, name)`, so the up/down buttons only help while
 * writing a long list — grouping a new level-3 feature beside its neighbours to
 * compare them, say. What is submitted is a set, not a sequence.
 */
export default function ClassFeaturesEditor({ value, onChange }: ClassFeaturesEditorProps) {
  const dupes = duplicateIndices(value);
  // Derived per mount, because the class page can hold the class form and a
  // subclass form at once.
  const hintId = useId();
  const rowIdBase = useId();

  // Stable per-row React keys, following ShopStockEditor. Index keys break a
  // list that reorders: React keeps the DOM node at each position and swaps only
  // the values into it, so focus, caret and an in-flight IME buffer stay at the
  // screen position instead of following the row. Concretely, under index keys
  // the ↑ a keyboard user just activated belongs to a different feature
  // afterwards, so pressing it again swaps the pair straight back and a row
  // cannot be walked up more than one place.
  //
  // Seeded from the initial value and kept in lockstep through the handlers
  // below. State rather than a ref because a ref may not be read during render;
  // the counter is a ref because it is only ever bumped inside a handler. Like
  // ShopStockEditor, this assumes the editor mounts with its final initial value
  // — the class form renders only once the class has loaded — so there is no
  // render-time reconcile.
  const keyCounter = useRef(value.length);
  const [keys, setKeys] = useState<string[]>(() => value.map((_, i) => `feature-${i}`));

  // Every emit is normalized, so a caller that hands over API rows carrying `id`
  // still gets clean rows back as soon as anything is edited.
  const emit = (rows: ClassFeatureDraft[]) => onChange(rows.map(toDraft));

  const update = (i: number, patch: Partial<ClassFeatureDraft>) =>
    emit(value.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));

  const remove = (i: number) => {
    setKeys(k => k.filter((_, idx) => idx !== i));
    emit(value.filter((_, idx) => idx !== i));
  };

  const add = () => {
    setKeys(k => [...k, `feature-${keyCounter.current++}`]);
    emit([...value, { ...EMPTY_FEATURE }]);
  };

  // One predicate drives both the button's disabled state and the handler's own
  // bail-out, rather than the handler re-deriving the bound. Stated once because
  // the two must not drift: a swap against a row that is not there assigns
  // `next[-1]` — a plain property, not an element — and leaves `undefined` in
  // the list, which then crashes the next render on `f.level` rather than
  // failing where the mistake was made.
  const canMove = (i: number, delta: number) => i + delta >= 0 && i + delta < value.length;

  const move = (i: number, delta: number) => {
    if (!canMove(i, delta)) return;
    const target = i + delta;
    const next = [...value];
    [next[i], next[target]] = [next[target], next[i]];
    setKeys(k => {
      const swapped = [...k];
      [swapped[i], swapped[target]] = [swapped[target], swapped[i]];
      return swapped;
    });
    emit(next);
  };

  return (
    <div>
      <span className={labelClasses}>Features by level</span>
      <p id={hintId} className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        Add one for each level that grants something. Descriptions are markdown. To give a feature a
        list of options, put <code>**Options**</code> on a line of its own, then each option as a{' '}
        <code>**Name**</code> line, an optional
        {' "Prerequisite:" or "Cost:" '}line, and its text. They show as a collapsible group
        wherever the feature&apos;s text appears.
      </p>
      {value.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">No features yet.</p>
      ) : (
        <div className="space-y-3 mb-2">
          {value.map((f, i) => {
            const levelId = `${rowIdBase}-${keys[i]}-level`;
            const nameId = `${rowIdBase}-${keys[i]}-name`;
            const descriptionId = `${rowIdBase}-${keys[i]}-description`;
            return (
              <div
                key={keys[i]}
                className="space-y-1 rounded-lg border border-gray-200 dark:border-gray-700 p-2"
              >
                {/* The host forms carry their own Name and Description fields, so
                    each control's accessible name keeps the "Feature" prefix
                    while the visible label text stays short. */}
                <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] gap-2 items-end">
                  <div>
                    <label htmlFor={levelId} className={rowLabel}>
                      Level
                    </label>
                    <input
                      id={levelId}
                      aria-label="Feature level"
                      type="number"
                      min={1}
                      max={MAX_LEVEL}
                      // A blank box is allowed through as a draft; only a parseable
                      // value is clamped and written. Clamping a cleared box straight
                      // back to 1 is what makes "select all, backspace, type 5" save
                      // level 15 — a legal value, so nothing downstream objects. The
                      // character editor's number inputs take the same
                      // `'' ? '' : clamp(...)` shape for the same reason.
                      value={Number.isNaN(f.level) ? '' : f.level}
                      onChange={e =>
                        update(i, {
                          level:
                            e.target.value === ''
                              ? Number.NaN
                              : clampIntToRange(e.target.value, 1, MAX_LEVEL),
                        })
                      }
                      // A row left blank commits to level 1 rather than submitting
                      // NaN, which the DTO would refuse with a message about a field
                      // the author never knowingly touched.
                      onBlur={() => Number.isNaN(f.level) && update(i, { level: 1 })}
                      className={`${cell} w-full`}
                    />
                  </div>
                  <div>
                    <label htmlFor={nameId} className={rowLabel}>
                      Name
                    </label>
                    <input
                      id={nameId}
                      aria-label="Feature name"
                      value={f.name}
                      onChange={e => update(i, { name: e.target.value })}
                      className={`${cell} w-full`}
                    />
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      aria-label={`Move feature ${i + 1} up`}
                      title="Move up"
                      disabled={!canMove(i, -1)}
                      onClick={() => move(i, -1)}
                      className={`${moveButton} p-1`}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`Move feature ${i + 1} down`}
                      title="Move down"
                      disabled={!canMove(i, 1)}
                      onClick={() => move(i, 1)}
                      className={`${moveButton} p-1`}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove feature ${i + 1}`}
                      title="Remove"
                      onClick={() => remove(i)}
                      className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <label htmlFor={descriptionId} className={rowLabel}>
                  Description
                </label>
                <textarea
                  id={descriptionId}
                  aria-label="Feature description"
                  aria-describedby={hintId}
                  rows={2}
                  value={f.description ?? ''}
                  onChange={e => update(i, { description: e.target.value })}
                  className={`${cell} w-full`}
                />
                {dupes.has(i) && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    This name is already used at this level. Change the name or the level — the same
                    name at a different level is fine.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={add}
        className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        + Add feature
      </button>
    </div>
  );
}
