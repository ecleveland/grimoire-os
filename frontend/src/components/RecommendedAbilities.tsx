import type { AbilityScores } from '@/lib/types';
import { ABILITY_KEY_TO_NAME } from '@/lib/ability-math';

/**
 * Informational "Recommended" markers for a class's primary ability scores
 * (VEG-447). Shared by the guided builder's Abilities step and the classic
 * editor so both render the cue identically. Purely additive — these never
 * change point-buy math, standard-array assignment, or how scores are stored.
 *
 * Accessibility: the emphasis is text ("Recommended"), not color alone, so the
 * cue is conveyed to screen readers.
 */

/** Inline tag flagging an ability row as recommended for the selected class. */
export function RecommendedAbilityTag() {
  return (
    <span
      data-testid="recommended-tag"
      className="ml-1 inline-block whitespace-nowrap rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300"
    >
      Recommended
    </span>
  );
}

/**
 * One-line summary of the recommended abilities, e.g.
 * "Recommended for Monk: Dexterity, Wisdom". Renders nothing when there's no
 * recommendation (no class, homebrew/free-typed class, or a class with no
 * primary-ability data) so the empty state is silent.
 */
export function RecommendedAbilitiesSummary({
  characterClass,
  recommended,
}: {
  /** The selected class's display name. Named to avoid the `className` footgun. */
  characterClass: string;
  recommended: (keyof AbilityScores)[];
}) {
  if (recommended.length === 0) return null;
  // `recommended` is already in canonical ABILITY_KEYS order (from
  // recommendedAbilityKeys), so map straight to names — no re-filter needed.
  const names = recommended.map(k => ABILITY_KEY_TO_NAME[k]);
  return (
    <p data-testid="recommended-summary" className="text-sm text-indigo-700 dark:text-indigo-300">
      Recommended for {characterClass}: {names.join(', ')}
    </p>
  );
}
