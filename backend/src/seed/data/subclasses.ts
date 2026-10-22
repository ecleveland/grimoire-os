// Eldritch Knight and Arcane Trickster are 2014 subclasses that SRD 5.2.1 does
// not carry. They keep their 2014 text, tagged source 'SRD 5.1', until a later
// decision on whether to keep them. Every other SRD subclass comes from
// docs/extracted-srd-json/subclasses.json.

// ── 1/3-Caster Spell Slot Progression ─────────────────────────────────
// Keyed by character level → { slot level → count }

/** 1/3 caster progression (Eldritch Knight, Arcane Trickster) — no slots at levels 1–2 */
const THIRD_CASTER_SLOTS: Record<number, Record<number, number>> = {
  1: {},
  2: {},
  3: { 1: 2 },
  4: { 1: 3 },
  5: { 1: 3 },
  6: { 1: 3 },
  7: { 1: 4, 2: 2 },
  8: { 1: 4, 2: 2 },
  9: { 1: 4, 2: 2 },
  10: { 1: 4, 2: 3 },
  11: { 1: 4, 2: 3 },
  12: { 1: 4, 2: 3 },
  13: { 1: 4, 2: 3, 3: 2 },
  14: { 1: 4, 2: 3, 3: 2 },
  15: { 1: 4, 2: 3, 3: 2 },
  16: { 1: 4, 2: 3, 3: 3 },
  17: { 1: 4, 2: 3, 3: 3 },
  18: { 1: 4, 2: 3, 3: 3 },
  19: { 1: 4, 2: 3, 3: 3, 4: 1 },
  20: { 1: 4, 2: 3, 3: 3, 4: 1 },
};

// ── 1/3-Caster Cantrips Known ─────────────────────────────────────────

/** Eldritch Knight cantrips: 0 at L1–2, 2 at L3, 3 at L10 */
const EK_CANTRIPS: Record<number, number> = {
  1: 0,
  2: 0,
  3: 2,
  4: 2,
  5: 2,
  6: 2,
  7: 2,
  8: 2,
  9: 2,
  10: 3,
  11: 3,
  12: 3,
  13: 3,
  14: 3,
  15: 3,
  16: 3,
  17: 3,
  18: 3,
  19: 3,
  20: 3,
};

/** Arcane Trickster cantrips: 0 at L1–2, 3 at L3, 4 at L10 */
const AT_CANTRIPS: Record<number, number> = {
  1: 0,
  2: 0,
  3: 3,
  4: 3,
  5: 3,
  6: 3,
  7: 3,
  8: 3,
  9: 3,
  10: 4,
  11: 4,
  12: 4,
  13: 4,
  14: 4,
  15: 4,
  16: 4,
  17: 4,
  18: 4,
  19: 4,
  20: 4,
};

// ── 1/3-Caster Spells Known ───────────────────────────────────────────

/** Shared spells known for 1/3 casters — 0 at L1–2, starts at L3 */
const THIRD_CASTER_SPELLS_KNOWN: Record<number, number> = {
  1: 0,
  2: 0,
  3: 3,
  4: 4,
  5: 4,
  6: 4,
  7: 5,
  8: 6,
  9: 6,
  10: 7,
  11: 8,
  12: 8,
  13: 8,
  14: 9,
  15: 10,
  16: 10,
  17: 10,
  18: 10,
  19: 11,
  20: 11,
};

export const srdSubclasses = [
  {
    name: 'Eldritch Knight',
    className: 'Fighter',
    source: 'SRD 5.1',
    description:
      'The archetypal Eldritch Knight combines the martial mastery common to all fighters with a careful study of magic. These knights learn a comparatively small number of spells, committing them to memory instead of keeping them in a spellbook.',
    features: [
      {
        level: 3,
        name: 'Spellcasting',
        description:
          'You augment your martial prowess with the ability to cast spells. You learn two wizard cantrips of your choice. You learn three 1st-level wizard spells of your choice, two of which must be from the abjuration and evocation schools.',
      },
      {
        level: 7,
        name: 'War Magic',
        description:
          'When you use your action to cast a cantrip, you can make one weapon attack as a bonus action.',
      },
      {
        level: 10,
        name: 'Eldritch Strike',
        description:
          'When you hit a creature with a weapon attack, that creature has disadvantage on the next saving throw it makes against a spell you cast before the end of your next turn.',
      },
      {
        level: 15,
        name: 'Arcane Charge',
        description:
          'When you use Action Surge, you can teleport up to 30 feet to an unoccupied space you can see. You can teleport before or after the additional action.',
      },
      {
        level: 18,
        name: 'Improved War Magic',
        description:
          'When you use your action to cast a spell, you can make one weapon attack as a bonus action.',
      },
    ],
    spellcasting: {
      ability: 'Intelligence',
      spellSlotProgression: THIRD_CASTER_SLOTS,
      cantripsKnown: EK_CANTRIPS,
      spellsKnown: THIRD_CASTER_SPELLS_KNOWN,
    },
  },
  {
    name: 'Arcane Trickster',
    className: 'Rogue',
    source: 'SRD 5.1',
    description:
      'Some rogues enhance their fine-honed skills of stealth and agility with magic, learning tricks of enchantment and illusion. These rogues include pickpockets and burglars, but also pranksters, mischief-makers, and a significant number of adventurers.',
    features: [
      {
        level: 3,
        name: 'Spellcasting',
        description:
          'You augment your roguish abilities with the ability to cast spells. You learn three wizard cantrips: Mage Hand and two others of your choice. You learn three 1st-level wizard spells of your choice, two of which must be from the enchantment and illusion schools.',
      },
      {
        level: 3,
        name: 'Mage Hand Legerdemain',
        description:
          "When you cast Mage Hand, you can make the spectral hand invisible, and you can perform additional tasks with it: stow or retrieve an object in a container worn or carried by another creature, use thieves' tools to pick locks and disarm traps at range. You can also use the bonus action granted by Cunning Action to control the hand.",
      },
      {
        level: 9,
        name: 'Magical Ambush',
        description:
          'If you are hidden from a creature when you cast a spell on it, the creature has disadvantage on any saving throw it makes against the spell this turn.',
      },
      {
        level: 13,
        name: 'Versatile Trickster',
        description:
          'You can use your Mage Hand to distract a creature. As a bonus action, you can designate a creature within 5 feet of the spectral hand. You have advantage on attack rolls against that creature until the end of your turn.',
      },
      {
        level: 17,
        name: 'Spell Thief',
        description:
          "You gain the ability to magically steal the knowledge of how to cast a spell from another spellcaster. Immediately after a creature casts a spell that targets you or includes you in its area of effect, you can use your reaction to force the creature to make a saving throw with its spellcasting ability modifier. The DC equals your spell save DC. On a failed save, you negate the spell's effect against you, and you steal the knowledge of the spell if it is at least 1st level and of a level you can cast. For the next 8 hours, you know the spell and can cast it using your spell slots.",
      },
    ],
    spellcasting: {
      ability: 'Intelligence',
      spellSlotProgression: THIRD_CASTER_SLOTS,
      cantripsKnown: AT_CANTRIPS,
      spellsKnown: THIRD_CASTER_SPELLS_KNOWN,
    },
  },
];
