import type { Feature } from '@/lib/types';

/**
 * Identity and render-key helpers for the features stored on a character sheet
 * (VEG-454). Mirrors the `character-play.ts` pattern: pure, no React, shared by
 * the level-up dialog and the three sheet sections that list features.
 */

// Postgres refuses a NUL inside jsonb text, and `features` is a jsonb column, so
// no stored name or source can contain the separator; `level` is an integer at
// the write boundary. That makes the join unambiguous — ("a", "b") and
// ("a<NUL>b", undefined) cannot collide the way a bare concatenation would.
const SEP = '\u0000';

/**
 * What makes two stored features the same grant: name, source, and the level it
 * arrived at.
 *
 * The level is the part that matters and the part that used to be missing. The
 * level-up dialog keys its "already owned" set on this to avoid appending a
 * second copy after a manual level revert. Keyed on name and source alone, that
 * guard was lossless only while a class could carry one feature name at one
 * level — VEG-507 widened the unique key to `[classId, name, level]` precisely
 * so an author could write Ability Score Improvement at 4/8/12/16/19, and the
 * guard then silently swallowed every occurrence after the first.
 *
 * Case-sensitive, untrimmed, and description-blind. The first two match how the
 * text is stored, so "Rage" and "rage" stay two grants; the third means editing
 * a feature's prose doesn't make it a different grant.
 *
 * A feature with no `level` — a species trait, or a row typed into the editor —
 * gets a distinct identity from the same name at level 1 rather than being
 * folded into it. That is deliberate: it can't claim a level it doesn't record,
 * so it no longer suppresses a catalog grant. See the level-less case in
 * `LevelUpSection.test.tsx`.
 */
export function characterFeatureIdentity(f: Feature): string {
  return `${f.name}${SEP}${f.source ?? ''}${SEP}${f.level ?? ''}`;
}

/**
 * A React key for one row of a rendered feature list.
 *
 * The identity alone isn't enough. `CharacterEditorForm` drops only blank-named
 * rows on save, so a player can put the same name in two feature rows and store
 * two byte-identical features; the index is what keeps their keys apart. Safe
 * here because every caller is a display-only list with no per-row state, whose
 * array grows at the end rather than reordering.
 */
export function featureRenderKey(f: Feature, index: number): string {
  return `${characterFeatureIdentity(f)}${SEP}${index}`;
}
