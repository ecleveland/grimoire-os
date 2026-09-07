'use client';

import type { ClassFeature } from '@/lib/types';

const cell =
  'px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const labelClasses = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
const moveButton =
  'text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 disabled:hover:text-gray-400 leading-none';

/** Highest level a feature can be gained at. Mirrors MAX_CHARACTER_LEVEL on the
 * server, where the DTO enforces the same bound; exported so the spec asserts
 * against one number rather than a hard-coded 20 in two places. */
export const MAX_FEATURE_LEVEL = 20;

const EMPTY_FEATURE: ClassFeature = { name: '', level: 1, description: '' };

/** Key a duplicate is detected by: the `[classId, name, level]` unique index the
 * server writes through, minus the parent. Case-sensitive, because the index is
 * a plain btree over text and warning about a pairing the server would accept is
 * worse than not warning at all. */
function identity(f: ClassFeature): string {
  return `${f.level}|${f.name}`;
}

/**
 * Indices of rows sharing a (name, level) pairing with another row.
 *
 * Blank names are skipped: a half-typed row is not yet a collision, and flagging
 * every fresh row the moment a second one is added would make the warning noise.
 */
function duplicateIndices(value: ClassFeature[]): Set<number> {
  const seen = new Map<string, number>();
  const dupes = new Set<number>();
  value.forEach((f, i) => {
    if (!f.name) return;
    const key = identity(f);
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

/** Coerce the level input to an integer inside the server's bounds. An empty or
 * unparseable box falls back to 1 rather than the previous value: clearing the
 * field mid-edit is normal, and fighting the keystroke is worse than a default. */
function clampLevel(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return 1;
  return Math.min(MAX_FEATURE_LEVEL, Math.max(1, parsed));
}

interface ClassFeaturesEditorProps {
  value: ClassFeature[];
  onChange: (next: ClassFeature[]) => void;
}

/**
 * Repeating rows for a class's per-level features (VEG-507).
 *
 * A third repeating-row editor rather than a generalization of the two that
 * exist, which is worth justifying: `FeaturesEditor` holds the character
 * sheet's `{ name, source, description }` — no level, and `source` is its
 * grouping key on the sheet — while `WeaponsEditor` is a different row shape
 * again. Neither surfaces validation and neither reorders, so generalizing would
 * have meant rewriting the character sheet's editor to serve a page it has
 * nothing to do with. VEG-336 item 3 still wants shared form primitives pulled
 * out of all three; that is the right place to merge them, not here.
 *
 * Not mounted anywhere yet. `ClassForm` and the class create/edit routes are
 * VEG-508; this is the piece those pages drop in.
 *
 * **Row order is a drafting aid, not stored state.** Every read path returns
 * features ordered by `(level, name)`, so the up/down buttons only help while
 * writing a long list — grouping a new level-3 feature next to its neighbours to
 * compare them, say. What is submitted is a set, not a sequence.
 *
 * Duplicate pairings are flagged inline as the author types. The server rejects
 * them with a 400 either way; this just means the first they hear of it is not
 * the submit button.
 */
export default function ClassFeaturesEditor({ value, onChange }: ClassFeaturesEditorProps) {
  const dupes = duplicateIndices(value);

  const update = (i: number, patch: Partial<ClassFeature>) =>
    onChange(value.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, { ...EMPTY_FEATURE }]);

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
    onChange(next);
  };

  return (
    <div>
      <span className={labelClasses}>Features</span>
      {value.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          No features yet. Add one for each level that grants something.
        </p>
      ) : (
        <div className="space-y-3 mb-2">
          {value.map((f, i) => (
            <div
              key={i}
              className="space-y-1 rounded-lg border border-gray-200 dark:border-gray-700 p-2"
            >
              <div className="grid grid-cols-12 gap-2 items-center">
                <input
                  aria-label="Feature level"
                  type="number"
                  min={1}
                  max={MAX_FEATURE_LEVEL}
                  placeholder="Lvl"
                  value={f.level}
                  onChange={e => update(i, { level: clampLevel(e.target.value) })}
                  className={`${cell} col-span-2`}
                />
                <input
                  aria-label="Feature name"
                  placeholder="Name"
                  value={f.name}
                  onChange={e => update(i, { name: e.target.value })}
                  className={`${cell} col-span-7`}
                />
                <div className="col-span-3 flex items-center justify-end gap-1">
                  <button
                    type="button"
                    aria-label={`Move feature ${i + 1} up`}
                    disabled={!canMove(i, -1)}
                    onClick={() => move(i, -1)}
                    className={moveButton}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move feature ${i + 1} down`}
                    disabled={!canMove(i, 1)}
                    onClick={() => move(i, 1)}
                    className={moveButton}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove feature ${i + 1}`}
                    onClick={() => remove(i)}
                    className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                  >
                    ×
                  </button>
                </div>
              </div>
              <textarea
                aria-label="Feature description"
                placeholder="Description"
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
          ))}
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
