// ── Printable SRD Cards: per-type field schema ─────────────────────────────
//
// The shared, typed contract for the M12 "Printable SRD Cards" feature. A DM
// assembles a print set of SRD content and prints it as cut-out 3×5" index
// cards. Each card type renders a *curated* subset of its full SRD record —
// deliberately trimmed so the body fits a 3×5" card at readable size, not a
// dump of every field.
//
// This contract is the design-led foundation the rest of the milestone builds
// against: the batch hydrate endpoint (VEG-263) produces these view-models and
// the card components (VEG-266 / VEG-267) render them. It is intentionally a
// view-model decoupled from the `Srd*` entity interfaces in `./srd` — the print
// payload carries only what a card shows, never the entity's full field set.
//
// Per VEG-262 this is a first cut; the field selections and caps below are
// expected to iterate once real data is rendered on real cards.

// ── Card type discriminants ────────────────────────────────────────────────

/**
 * Every printable card type. Source-of-truth list for iteration and validation
 * (e.g. the batch endpoint's request DTO). Each member has a matching variant
 * in the {@link PrintableCard} discriminated union, keyed by `type`.
 */
export const PRINTABLE_CARD_TYPES = [
  'monster',
  'spell',
  'item',
  'race',
  'background',
  'species',
  'feature',
] as const;

export type PrintableCardType = (typeof PRINTABLE_CARD_TYPES)[number];

// ── Shared card sub-shapes ─────────────────────────────────────────────────

/** The six-ability score row printed on a monster card. */
export interface PrintableAbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

/**
 * A condensed name + description entry — a monster action/trait, or a
 * race/species/background trait summary line. Descriptions are expected to be
 * pre-trimmed by the producer to fit the card.
 */
export interface PrintableNamedEntry {
  name: string;
  description: string;
}

/**
 * The parent of a printable feature card. Mirrors the backend's cross-parent
 * feature model (`UnifiedFeatureData.parent`): a class/subclass/race/background
 * feature, identified by its parent's kind, id, and display name.
 */
export type PrintableFeatureParentKind = 'class' | 'subclass' | 'race' | 'background';

export interface PrintableFeatureParent {
  kind: PrintableFeatureParentKind;
  id: string;
  name: string;
}

// ── Trimming caps (first cut — tune when rendering real data) ───────────────
//
// Caps the producer applies so a card's body fits a 3×5" footprint. Shared
// here so the backend (which trims) and the card components (which assume the
// trim) agree on a single source of truth.

/** Max actions shown on a monster card; legendary/extra actions are dropped. */
export const PRINTABLE_MONSTER_ACTION_CAP = 4;
/** Max traits shown on a monster card. */
export const PRINTABLE_MONSTER_TRAIT_CAP = 3;
/** Max trait-summary lines on a race / species / background card. */
export const PRINTABLE_TRAIT_SUMMARY_CAP = 4;

// ── Per-type card view-models ──────────────────────────────────────────────

/**
 * Monster: name + size/type/alignment header, CR/XP, AC, HP, speed, the ability
 * row, and a capped action list (legendary actions and excess traits are
 * trimmed to fit). Trimmed from {@link SrdMonster}.
 */
export interface PrintableMonsterCard {
  type: 'monster';
  id: string;
  name: string;
  size: string;
  /** The creature type, e.g. "dragon" (`SrdMonster.type`). */
  creatureType: string;
  alignment: string;
  challengeRating: number;
  experiencePoints?: number;
  armorClass: number;
  hitPoints: number;
  speed: string;
  abilities: PrintableAbilityScores;
  /** Capped to {@link PRINTABLE_MONSTER_ACTION_CAP}. */
  actions: PrintableNamedEntry[];
  /** Capped to {@link PRINTABLE_MONSTER_TRAIT_CAP}; omitted when none. */
  traits?: PrintableNamedEntry[];
}

/**
 * Spell: name, level/school, the casting line (time/range/components/duration),
 * concentration & ritual flags, and a condensed description. Trimmed from
 * {@link SrdSpell}.
 */
export interface PrintableSpellCard {
  type: 'spell';
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  description: string;
}

/**
 * Item: name, category/rarity, attunement, condensed properties and
 * description. Trimmed from {@link SrdItem}.
 */
export interface PrintableItemCard {
  type: 'item';
  id: string;
  name: string;
  /** The item category, e.g. "Weapon" (`SrdItem.category`). */
  category: string;
  rarity?: string;
  requiresAttunement?: boolean;
  properties: string[];
  description?: string;
}

/**
 * Race: name + a short trait summary. Trimmed from {@link SrdRace} (traits
 * capped to {@link PRINTABLE_TRAIT_SUMMARY_CAP}).
 */
export interface PrintableRaceCard {
  type: 'race';
  id: string;
  name: string;
  traits: PrintableNamedEntry[];
}

/**
 * Species: name + a short trait summary. Trimmed from {@link SrdSpecies}
 * (traits capped to {@link PRINTABLE_TRAIT_SUMMARY_CAP}).
 */
export interface PrintableSpeciesCard {
  type: 'species';
  id: string;
  name: string;
  traits: PrintableNamedEntry[];
}

/**
 * Background: name + a short trait/feature summary. Trimmed from
 * {@link SrdBackground} (entries capped to {@link PRINTABLE_TRAIT_SUMMARY_CAP}).
 */
export interface PrintableBackgroundCard {
  type: 'background';
  id: string;
  name: string;
  traits: PrintableNamedEntry[];
}

/**
 * Feature: a single cross-parent class/subclass/race/background feature — name,
 * its parent, the unlock level (when applicable), and a condensed description.
 * Reuses the backend's existing relational feature data.
 */
export interface PrintableFeatureCard {
  type: 'feature';
  id: string;
  name: string;
  parent: PrintableFeatureParent;
  level?: number;
  description: string;
}

/**
 * The full printable-card contract: a discriminated union keyed by `type`, so
 * the print route and card components can switch over it type-safely. Every
 * member of {@link PRINTABLE_CARD_TYPES} has exactly one variant here.
 */
export type PrintableCard =
  | PrintableMonsterCard
  | PrintableSpellCard
  | PrintableItemCard
  | PrintableRaceCard
  | PrintableSpeciesCard
  | PrintableBackgroundCard
  | PrintableFeatureCard;

// ── Batch hydrate contract (VEG-263) ───────────────────────────────────────

/**
 * Hard cap on the total number of ids accepted by the batch hydrate endpoint
 * (`POST /srd/cards`) across all selections. Requests above this are rejected
 * with a 400. Deliberately above the print tray's soft cap (60) so the UI
 * warning fires well before the API refuses.
 */
export const PRINTABLE_CARD_BATCH_MAX = 100;

/** One group of hydrated cards, keyed by the card type that produced it. */
export interface PrintableCardGroup {
  type: PrintableCardType;
  cards: PrintableCard[];
}

/**
 * Response of the batch hydrate endpoint: one group per distinct requested
 * type, in first-appearance request order, so the print route can lay out
 * grouped-by-type with page breaks. Unknown ids are silently dropped, so a
 * group's `cards` may be shorter than the requested `ids`.
 */
export interface HydratePrintableCardsResponse {
  groups: PrintableCardGroup[];
}

// ── Contract integrity (compile-time only) ─────────────────────────────────
//
// Guarantee the PRINTABLE_CARD_TYPES tuple and the PrintableCard union stay in
// lock-step: the set of declared card types must exactly equal the set of union
// variant discriminants. These are non-exported type aliases — they emit no JS
// and are excluded from the emitted .d.ts, so they exist only to fail `tsc` if
// the two drift apart (add a type to the tuple but forget the variant, or vice
// versa). `_AssertCardTypesMatchVariants` resolves to `true`; the
// `extends true` constraint turns any mismatch into a compile error.

type _Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type _Expect<T extends true> = T;

type _AssertCardTypesMatchVariants = _Expect<_Equal<PrintableCardType, PrintableCard['type']>>;
