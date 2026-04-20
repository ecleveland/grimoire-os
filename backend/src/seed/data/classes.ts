// ── Spell Slot Progression Tables ──────────────────────────────────────
// Keyed by character level → { slot level → count }

/** Full caster progression (Bard, Cleric, Druid, Sorcerer, Wizard) */
const FULL_CASTER_SLOTS: Record<number, Record<number, number>> = {
  1: { 1: 2 },
  2: { 1: 3 },
  3: { 1: 4, 2: 2 },
  4: { 1: 4, 2: 3 },
  5: { 1: 4, 2: 3, 3: 2 },
  6: { 1: 4, 2: 3, 3: 3 },
  7: { 1: 4, 2: 3, 3: 3, 4: 1 },
  8: { 1: 4, 2: 3, 3: 3, 4: 2 },
  9: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  11: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  12: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  13: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  14: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  15: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  16: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
  18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
  19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
  20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 },
};

/** Half caster progression (Paladin, Ranger) — no slots at level 1 */
const HALF_CASTER_SLOTS: Record<number, Record<number, number>> = {
  1: {},
  2: { 1: 2 },
  3: { 1: 3 },
  4: { 1: 3 },
  5: { 1: 4, 2: 2 },
  6: { 1: 4, 2: 2 },
  7: { 1: 4, 2: 3 },
  8: { 1: 4, 2: 3 },
  9: { 1: 4, 2: 3, 3: 2 },
  10: { 1: 4, 2: 3, 3: 2 },
  11: { 1: 4, 2: 3, 3: 3 },
  12: { 1: 4, 2: 3, 3: 3 },
  13: { 1: 4, 2: 3, 3: 3, 4: 1 },
  14: { 1: 4, 2: 3, 3: 3, 4: 1 },
  15: { 1: 4, 2: 3, 3: 3, 4: 2 },
  16: { 1: 4, 2: 3, 3: 3, 4: 2 },
  17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
};

// ── Cantrips Known Progression Tables ──────────────────────────────────
// Keyed by character level → cantrips known count

/** Cantrips: 2 → 3 (L4) → 4 (L10) — Bard, Druid, Warlock */
const CANTRIPS_2_3_4: Record<number, number> = {
  1: 2,
  2: 2,
  3: 2,
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

/** Cantrips: 3 → 4 (L4) → 5 (L10) — Cleric, Wizard */
const CANTRIPS_3_4_5: Record<number, number> = {
  1: 3,
  2: 3,
  3: 3,
  4: 4,
  5: 4,
  6: 4,
  7: 4,
  8: 4,
  9: 4,
  10: 5,
  11: 5,
  12: 5,
  13: 5,
  14: 5,
  15: 5,
  16: 5,
  17: 5,
  18: 5,
  19: 5,
  20: 5,
};

/** Cantrips: 4 → 5 (L4) → 6 (L10) — Sorcerer */
const CANTRIPS_4_5_6: Record<number, number> = {
  1: 4,
  2: 4,
  3: 4,
  4: 5,
  5: 5,
  6: 5,
  7: 5,
  8: 5,
  9: 5,
  10: 6,
  11: 6,
  12: 6,
  13: 6,
  14: 6,
  15: 6,
  16: 6,
  17: 6,
  18: 6,
  19: 6,
  20: 6,
};

// ── Spells Known Progression Tables ───────────────────────────────────
// Keyed by character level → spells known count (only for "spells known" classes)

/** Bard spells known — includes Magical Secrets bumps at L10/14/18 */
const BARD_SPELLS_KNOWN: Record<number, number> = {
  1: 4,
  2: 5,
  3: 6,
  4: 7,
  5: 8,
  6: 9,
  7: 10,
  8: 11,
  9: 12,
  10: 14,
  11: 15,
  12: 15,
  13: 16,
  14: 18,
  15: 19,
  16: 19,
  17: 20,
  18: 22,
  19: 22,
  20: 22,
};

/** Ranger spells known — 0 at L1 (no spellcasting until L2) */
const RANGER_SPELLS_KNOWN: Record<number, number> = {
  1: 0,
  2: 2,
  3: 3,
  4: 3,
  5: 4,
  6: 4,
  7: 5,
  8: 5,
  9: 6,
  10: 6,
  11: 7,
  12: 7,
  13: 8,
  14: 8,
  15: 9,
  16: 9,
  17: 10,
  18: 10,
  19: 11,
  20: 11,
};

/** Sorcerer spells known */
const SORCERER_SPELLS_KNOWN: Record<number, number> = {
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 6,
  6: 7,
  7: 8,
  8: 9,
  9: 10,
  10: 11,
  11: 12,
  12: 12,
  13: 13,
  14: 13,
  15: 14,
  16: 14,
  17: 15,
  18: 15,
  19: 15,
  20: 15,
};

/** Warlock spells known */
const WARLOCK_SPELLS_KNOWN: Record<number, number> = {
  1: 2,
  2: 3,
  3: 4,
  4: 5,
  5: 6,
  6: 7,
  7: 8,
  8: 9,
  9: 10,
  10: 10,
  11: 11,
  12: 11,
  13: 12,
  14: 12,
  15: 13,
  16: 13,
  17: 14,
  18: 14,
  19: 15,
  20: 15,
};

/** Warlock Pact Magic progression — slots + slot level per character level */
const PACT_MAGIC_SLOTS: Record<number, { slots: number; slotLevel: number }> = {
  1: { slots: 1, slotLevel: 1 },
  2: { slots: 2, slotLevel: 1 },
  3: { slots: 2, slotLevel: 2 },
  4: { slots: 2, slotLevel: 2 },
  5: { slots: 2, slotLevel: 3 },
  6: { slots: 2, slotLevel: 3 },
  7: { slots: 2, slotLevel: 4 },
  8: { slots: 2, slotLevel: 4 },
  9: { slots: 2, slotLevel: 5 },
  10: { slots: 2, slotLevel: 5 },
  11: { slots: 3, slotLevel: 5 },
  12: { slots: 3, slotLevel: 5 },
  13: { slots: 3, slotLevel: 5 },
  14: { slots: 3, slotLevel: 5 },
  15: { slots: 3, slotLevel: 5 },
  16: { slots: 3, slotLevel: 5 },
  17: { slots: 4, slotLevel: 5 },
  18: { slots: 4, slotLevel: 5 },
  19: { slots: 4, slotLevel: 5 },
  20: { slots: 4, slotLevel: 5 },
};

export const srdClasses = [
  {
    name: 'Barbarian',
    hitDie: 'd12',
    primaryAbilities: ['Strength'],
    savingThrows: ['Strength', 'Constitution'],
    armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
    weaponProficiencies: ['Simple weapons', 'Martial weapons'],
    skillChoices: [
      'Animal Handling',
      'Athletics',
      'Intimidation',
      'Nature',
      'Perception',
      'Survival',
    ],
    toolProficiencies: [],
    numSkillChoices: 2,
    description: 'A fierce warrior of primitive background who can enter a battle rage.',
    features: [
      {
        level: 1,
        name: 'Rage',
        description:
          'In battle, you fight with primal ferocity. On your turn, you can enter a rage as a bonus action. While raging, you gain advantage on Strength checks and saving throws, bonus rage damage on melee weapon attacks using Strength, and resistance to bludgeoning, piercing, and slashing damage.',
      },
      {
        level: 1,
        name: 'Unarmored Defense',
        description:
          'While you are not wearing any armor, your Armor Class equals 10 + your Dexterity modifier + your Constitution modifier. You can use a shield and still gain this benefit.',
      },
      {
        level: 2,
        name: 'Reckless Attack',
        description:
          'You can throw aside all concern for defense to attack with fierce desperation. When you make your first attack on your turn, you can decide to attack recklessly, giving you advantage on melee weapon attack rolls using Strength during this turn, but attack rolls against you have advantage until your next turn.',
      },
      {
        level: 2,
        name: 'Danger Sense',
        description:
          'You gain an uncanny sense of when things nearby are not as they should be. You have advantage on Dexterity saving throws against effects that you can see, such as traps and spells. You do not gain this benefit if you are blinded, deafened, or incapacitated.',
      },
      {
        level: 3,
        name: 'Primal Path',
        description:
          'You choose a path that shapes the nature of your rage. Your choice grants you features at 3rd level and again at 6th, 10th, and 14th levels.',
      },
      {
        level: 5,
        name: 'Extra Attack',
        description:
          'You can attack twice, instead of once, whenever you take the Attack action on your turn.',
      },
      {
        level: 5,
        name: 'Fast Movement',
        description: 'Your speed increases by 10 feet while you are not wearing heavy armor.',
      },
      {
        level: 7,
        name: 'Feral Instinct',
        description:
          'Your instincts are so honed that you have advantage on initiative rolls. Additionally, if you are surprised at the beginning of combat and are not incapacitated, you can act normally on your first turn, but only if you enter your rage before doing anything else on that turn.',
      },
      {
        level: 9,
        name: 'Brutal Critical',
        description:
          'You can roll one additional weapon damage die when determining the extra damage for a critical hit with a melee attack. This increases to two additional dice at 13th level and three additional dice at 17th level.',
      },
      {
        level: 11,
        name: 'Relentless Rage',
        description:
          'Your rage can keep you fighting despite grievous wounds. If you drop to 0 hit points while raging and do not die outright, you can make a DC 10 Constitution saving throw. If you succeed, you drop to 1 hit point instead. Each time you use this feature after the first, the DC increases by 5. The DC resets to 10 when you finish a short or long rest.',
      },
      {
        level: 15,
        name: 'Persistent Rage',
        description:
          'Your rage is so fierce that it ends early only if you fall unconscious or if you choose to end it.',
      },
      {
        level: 18,
        name: 'Indomitable Might',
        description:
          'If your total for a Strength check is less than your Strength score, you can use that score in place of the total.',
      },
      {
        level: 20,
        name: 'Primal Champion',
        description:
          'You embody the power of the wilds. Your Strength and Constitution scores each increase by 4. Your maximum for those scores is now 24.',
      },
    ],
    subclassLevel: 3,
  },
  {
    name: 'Bard',
    hitDie: 'd8',
    primaryAbilities: ['Charisma'],
    savingThrows: ['Dexterity', 'Charisma'],
    armorProficiencies: ['Light armor'],
    weaponProficiencies: [
      'Simple weapons',
      'Hand crossbows',
      'Longswords',
      'Rapiers',
      'Shortswords',
    ],
    skillChoices: [
      'Acrobatics',
      'Animal Handling',
      'Arcana',
      'Athletics',
      'Deception',
      'History',
      'Insight',
      'Intimidation',
      'Investigation',
      'Medicine',
      'Nature',
      'Perception',
      'Performance',
      'Persuasion',
      'Religion',
      'Sleight of Hand',
      'Stealth',
      'Survival',
    ],
    toolProficiencies: ['Three musical instruments of your choice'],
    numSkillChoices: 3,
    description: 'An inspiring magician whose power echoes the music of creation.',
    features: [
      {
        level: 1,
        name: 'Spellcasting',
        description:
          'You have learned to untangle and reshape the fabric of reality in harmony with your wishes and music. Your spells are part of your vast repertoire, magic that you can tune to different situations. Charisma is your spellcasting ability.',
      },
      {
        level: 1,
        name: 'Bardic Inspiration',
        description:
          'You can inspire others through stirring words or music. To do so, you use a bonus action on your turn to choose one creature other than yourself within 60 feet of you who can hear you. That creature gains one Bardic Inspiration die, a d6, which increases at higher levels.',
      },
      {
        level: 2,
        name: 'Jack of All Trades',
        description:
          'You can add half your proficiency bonus, rounded down, to any ability check you make that does not already include your proficiency bonus.',
      },
      {
        level: 2,
        name: 'Song of Rest',
        description:
          'You can use soothing music or oration to help revitalize your wounded allies during a short rest. If you or any friendly creatures who can hear your performance regain hit points at the end of the short rest by spending one or more Hit Dice, each of those creatures regains an extra 1d6 hit points.',
      },
      {
        level: 3,
        name: 'Bard College',
        description:
          'You delve into the advanced techniques of a bard college of your choice. Your choice grants you features at 3rd level and again at 6th and 14th level.',
      },
      {
        level: 3,
        name: 'Expertise',
        description:
          'Choose two of your skill proficiencies. Your proficiency bonus is doubled for any ability check you make that uses either of the chosen proficiencies. At 10th level, you can choose another two skill proficiencies to gain this benefit.',
      },
      {
        level: 5,
        name: 'Font of Inspiration',
        description:
          'You regain all of your expended uses of Bardic Inspiration when you finish a short or long rest.',
      },
      {
        level: 6,
        name: 'Countercharm',
        description:
          'You gain the ability to use musical notes or words of power to disrupt mind-influencing effects. As an action, you can start a performance that lasts until the end of your next turn. During that time, you and any friendly creatures within 30 feet of you have advantage on saving throws against being frightened or charmed.',
      },
      {
        level: 10,
        name: 'Magical Secrets',
        description:
          'You have plundered magical knowledge from a wide spectrum of disciplines. Choose two spells from any class, including this one. The chosen spells count as bard spells for you. You learn two additional spells from any class at 14th and 18th level.',
      },
      {
        level: 20,
        name: 'Superior Inspiration',
        description:
          'When you roll initiative and have no uses of Bardic Inspiration left, you regain one use.',
      },
    ],
    spellcasting: {
      ability: 'Charisma',
      spellSlotProgression: FULL_CASTER_SLOTS,
      cantripsKnown: CANTRIPS_2_3_4,
      spellsKnown: BARD_SPELLS_KNOWN,
    },
    subclassLevel: 3,
  },
  {
    name: 'Cleric',
    hitDie: 'd8',
    primaryAbilities: ['Wisdom'],
    savingThrows: ['Wisdom', 'Charisma'],
    armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
    weaponProficiencies: ['Simple weapons'],
    skillChoices: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'],
    toolProficiencies: [],
    numSkillChoices: 2,
    description: 'A priestly champion who wields divine magic in service of a higher power.',
    features: [
      {
        level: 1,
        name: 'Spellcasting',
        description:
          'As a conduit for divine power, you can cast cleric spells. Wisdom is your spellcasting ability for your cleric spells.',
      },
      {
        level: 1,
        name: 'Divine Domain',
        description:
          'Choose one domain related to your deity. Your choice grants you domain spells and other features when you choose it at 1st level. It also grants you additional ways to use Channel Divinity when you gain that feature at 2nd level, and additional benefits at 6th, 8th, and 17th levels.',
      },
      {
        level: 2,
        name: 'Channel Divinity',
        description:
          'You gain the ability to channel divine energy directly from your deity, using that energy to fuel magical effects. You start with two such effects: Turn Undead and an effect determined by your domain. You can use Channel Divinity once between rests, increasing to twice at 6th level and three times at 18th level.',
      },
      {
        level: 2,
        name: 'Channel Divinity: Turn Undead',
        description:
          'As an action, you present your holy symbol and speak a prayer censuring the undead. Each undead that can see or hear you within 30 feet of you must make a Wisdom saving throw. If the creature fails, it is turned for 1 minute or until it takes any damage.',
      },
      {
        level: 5,
        name: 'Destroy Undead',
        description:
          'When an undead fails its saving throw against your Turn Undead feature, the creature is instantly destroyed if its challenge rating is at or below a certain threshold based on your cleric level.',
      },
      {
        level: 10,
        name: 'Divine Intervention',
        description:
          'You can call on your deity to intervene on your behalf when your need is great. As an action, you describe the assistance you seek, and roll a percentile die. If you roll a number equal to or lower than your cleric level, your deity intervenes. At 20th level, your call for intervention succeeds automatically.',
      },
    ],
    spellcasting: {
      ability: 'Wisdom',
      spellSlotProgression: FULL_CASTER_SLOTS,
      cantripsKnown: CANTRIPS_3_4_5,
      preparedFormula: 'level + wisdom modifier',
    },
    subclassLevel: 1,
  },
  {
    name: 'Druid',
    hitDie: 'd8',
    primaryAbilities: ['Wisdom'],
    savingThrows: ['Intelligence', 'Wisdom'],
    armorProficiencies: [
      'Light armor',
      'Medium armor',
      'Shields (druids will not wear armor or use shields made of metal)',
    ],
    weaponProficiencies: [
      'Clubs',
      'Daggers',
      'Darts',
      'Javelins',
      'Maces',
      'Quarterstaffs',
      'Scimitars',
      'Sickles',
      'Slings',
      'Spears',
    ],
    skillChoices: [
      'Arcana',
      'Animal Handling',
      'Insight',
      'Medicine',
      'Nature',
      'Perception',
      'Religion',
      'Survival',
    ],
    toolProficiencies: ['Herbalism kit'],
    numSkillChoices: 2,
    description:
      'A priest of the Old Faith, wielding the powers of nature and adopting animal forms.',
    features: [
      {
        level: 1,
        name: 'Druidic',
        description:
          'You know Druidic, the secret language of druids. You can speak the language and use it to leave hidden messages. You and others who know this language automatically spot such a message.',
      },
      {
        level: 1,
        name: 'Spellcasting',
        description:
          'Drawing on the divine essence of nature itself, you can cast spells to shape that essence to your will. Wisdom is your spellcasting ability for your druid spells.',
      },
      {
        level: 2,
        name: 'Wild Shape',
        description:
          'You can use your action to magically assume the shape of a beast that you have seen before. You can use this feature twice between rests. Your druid level determines the beasts you can transform into.',
      },
      {
        level: 2,
        name: 'Druid Circle',
        description:
          'You choose to identify with a circle of druids. Your choice grants you features at 2nd level and again at 6th, 10th, and 14th level.',
      },
      {
        level: 18,
        name: 'Timeless Body',
        description:
          'The primal magic that you wield causes you to age more slowly. For every 10 years that pass, your body ages only 1 year.',
      },
      {
        level: 18,
        name: 'Beast Spells',
        description:
          'You can cast many of your druid spells in any shape you assume using Wild Shape. You can perform the somatic and verbal components of a druid spell while in a beast shape, but you are not able to provide material components.',
      },
      {
        level: 20,
        name: 'Archdruid',
        description:
          'You can use your Wild Shape an unlimited number of times. Additionally, you can ignore the verbal and somatic components of your druid spells, as well as any material components that lack a cost and are not consumed by a spell.',
      },
    ],
    spellcasting: {
      ability: 'Wisdom',
      spellSlotProgression: FULL_CASTER_SLOTS,
      cantripsKnown: CANTRIPS_2_3_4,
      preparedFormula: 'level + wisdom modifier',
    },
    subclassLevel: 2,
  },
  {
    name: 'Fighter',
    hitDie: 'd10',
    primaryAbilities: ['Strength', 'Dexterity'],
    savingThrows: ['Strength', 'Constitution'],
    armorProficiencies: ['All armor', 'Shields'],
    weaponProficiencies: ['Simple weapons', 'Martial weapons'],
    skillChoices: [
      'Acrobatics',
      'Animal Handling',
      'Athletics',
      'History',
      'Insight',
      'Intimidation',
      'Perception',
      'Survival',
    ],
    toolProficiencies: [],
    numSkillChoices: 2,
    description: 'A master of martial combat, skilled with a variety of weapons and armor.',
    features: [
      {
        level: 1,
        name: 'Fighting Style',
        description:
          'You adopt a particular style of fighting as your specialty. Choose one of the following options: Archery, Defense, Dueling, Great Weapon Fighting, Protection, or Two-Weapon Fighting. You cannot take a Fighting Style option more than once.',
      },
      {
        level: 1,
        name: 'Second Wind',
        description:
          'You have a limited well of stamina that you can draw on to protect yourself from harm. On your turn, you can use a bonus action to regain hit points equal to 1d10 + your fighter level. Once you use this feature, you must finish a short or long rest before you can use it again.',
      },
      {
        level: 2,
        name: 'Action Surge',
        description:
          'You can push yourself beyond your normal limits for a moment. On your turn, you can take one additional action. Once you use this feature, you must finish a short or long rest before you can use it again. You gain a second use at 17th level.',
      },
      {
        level: 3,
        name: 'Martial Archetype',
        description:
          'You choose an archetype that you strive to emulate in your combat styles and techniques. The archetype you choose grants you features at 3rd level and again at 7th, 10th, 15th, and 18th level.',
      },
      {
        level: 5,
        name: 'Extra Attack',
        description:
          'You can attack twice, instead of once, whenever you take the Attack action on your turn. The number of attacks increases to three when you reach 11th level and to four when you reach 20th level.',
      },
      {
        level: 9,
        name: 'Indomitable',
        description:
          'You can reroll a saving throw that you fail. If you do so, you must use the new roll. You can use this feature once between long rests. You gain additional uses at 13th and 17th level.',
      },
    ],
    subclassLevel: 3,
  },
  {
    name: 'Monk',
    hitDie: 'd8',
    primaryAbilities: ['Dexterity', 'Wisdom'],
    savingThrows: ['Strength', 'Dexterity'],
    armorProficiencies: [],
    weaponProficiencies: ['Simple weapons', 'Shortswords'],
    skillChoices: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'],
    toolProficiencies: ["Choose one type of artisan's tools or one musical instrument"],
    numSkillChoices: 2,
    description:
      'A master of martial arts, harnessing the power of the body in pursuit of physical and spiritual perfection.',
    features: [
      {
        level: 1,
        name: 'Unarmored Defense',
        description:
          'While you are wearing no armor and not wielding a shield, your AC equals 10 + your Dexterity modifier + your Wisdom modifier.',
      },
      {
        level: 1,
        name: 'Martial Arts',
        description:
          'Your practice of martial arts gives you mastery of combat styles that use unarmed strikes and monk weapons. You gain benefits while unarmed or wielding only monk weapons and not wearing armor or a shield, including using Dexterity for attack and damage rolls and rolling a martial arts die in place of normal damage.',
      },
      {
        level: 2,
        name: 'Ki',
        description:
          'Your training allows you to harness the mystic energy of ki. You have a number of ki points equal to your monk level. You can spend these points to fuel various ki features: Flurry of Blows, Patient Defense, and Step of the Wind.',
      },
      {
        level: 2,
        name: 'Unarmored Movement',
        description:
          'Your speed increases by 10 feet while you are not wearing armor or wielding a shield. This bonus increases as you gain monk levels. At 9th level, you gain the ability to move along vertical surfaces and across liquids on your turn without falling.',
      },
      {
        level: 3,
        name: 'Monastic Tradition',
        description:
          'You commit yourself to a monastic tradition. Your tradition grants you features at 3rd level and again at 6th, 11th, and 17th level.',
      },
      {
        level: 3,
        name: 'Deflect Missiles',
        description:
          'You can use your reaction to deflect or catch the missile when you are hit by a ranged weapon attack. When you do so, the damage you take from the attack is reduced by 1d10 + your Dexterity modifier + your monk level.',
      },
      {
        level: 4,
        name: 'Slow Fall',
        description:
          'You can use your reaction when you fall to reduce any falling damage you take by an amount equal to five times your monk level.',
      },
      {
        level: 5,
        name: 'Extra Attack',
        description:
          'You can attack twice, instead of once, whenever you take the Attack action on your turn.',
      },
      {
        level: 5,
        name: 'Stunning Strike',
        description:
          "You can interfere with the flow of ki in an opponent's body. When you hit another creature with a melee weapon attack, you can spend 1 ki point to attempt a stunning strike. The target must succeed on a Constitution saving throw or be stunned until the end of your next turn.",
      },
      {
        level: 6,
        name: 'Ki-Empowered Strikes',
        description:
          'Your unarmed strikes count as magical for the purpose of overcoming resistance and immunity to nonmagical attacks and damage.',
      },
      {
        level: 7,
        name: 'Evasion',
        description:
          'When you are subjected to an effect that allows you to make a Dexterity saving throw to take only half damage, you instead take no damage if you succeed on the saving throw, and only half damage if you fail.',
      },
      {
        level: 7,
        name: 'Stillness of Mind',
        description:
          'You can use your action to end one effect on yourself that is causing you to be charmed or frightened.',
      },
      {
        level: 10,
        name: 'Purity of Body',
        description:
          'Your mastery of the ki flowing through you makes you immune to disease and poison.',
      },
      {
        level: 13,
        name: 'Tongue of the Sun and Moon',
        description:
          'You learn to touch the ki of other minds so that you understand all spoken languages. Moreover, any creature that can understand a language can understand what you say.',
      },
      {
        level: 14,
        name: 'Diamond Soul',
        description:
          'Your mastery of ki grants you proficiency in all saving throws. Additionally, whenever you make a saving throw and fail, you can spend 1 ki point to reroll it and take the second result.',
      },
      {
        level: 15,
        name: 'Timeless Body',
        description:
          'Your ki sustains you so that you suffer none of the frailty of old age, and you cannot be aged magically. You can still die of old age, however. In addition, you no longer need food or water.',
      },
      {
        level: 18,
        name: 'Empty Body',
        description:
          'You can use your action to spend 4 ki points to become invisible for 1 minute. During that time, you also have resistance to all damage but force damage. Additionally, you can spend 8 ki points to cast the astral projection spell, without needing material components.',
      },
      {
        level: 20,
        name: 'Perfect Self',
        description:
          'When you roll for initiative and have no ki points remaining, you regain 4 ki points.',
      },
    ],
    subclassLevel: 3,
  },
  {
    name: 'Paladin',
    hitDie: 'd10',
    primaryAbilities: ['Strength', 'Charisma'],
    savingThrows: ['Wisdom', 'Charisma'],
    armorProficiencies: ['All armor', 'Shields'],
    weaponProficiencies: ['Simple weapons', 'Martial weapons'],
    skillChoices: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'],
    toolProficiencies: [],
    numSkillChoices: 2,
    description: 'A holy warrior bound to a sacred oath.',
    features: [
      {
        level: 1,
        name: 'Divine Sense',
        description:
          'The presence of strong evil registers on your senses like a noxious odor, and powerful good rings like heavenly music in your ears. As an action, you can detect any celestial, fiend, or undead within 60 feet of you that is not behind total cover.',
      },
      {
        level: 1,
        name: 'Lay on Hands',
        description:
          'Your blessed touch can heal wounds. You have a pool of healing power that replenishes when you take a long rest. With that pool, you can restore a total number of hit points equal to your paladin level x 5.',
      },
      {
        level: 2,
        name: 'Fighting Style',
        description:
          'You adopt a particular style of fighting as your specialty. Choose one of the following options: Defense, Dueling, Great Weapon Fighting, or Protection.',
      },
      {
        level: 2,
        name: 'Spellcasting',
        description:
          'By 2nd level, you have learned to draw on divine magic through meditation and prayer to cast spells. Charisma is your spellcasting ability for your paladin spells.',
      },
      {
        level: 2,
        name: 'Divine Smite',
        description:
          "When you hit a creature with a melee weapon attack, you can expend one spell slot to deal radiant damage to the target, in addition to the weapon's damage. The extra damage is 2d8 for a 1st-level spell slot, plus 1d8 for each spell level higher than 1st, to a maximum of 5d8.",
      },
      {
        level: 3,
        name: 'Divine Health',
        description: 'The divine magic flowing through you makes you immune to disease.',
      },
      {
        level: 3,
        name: 'Sacred Oath',
        description:
          'You swear the oath that binds you as a paladin forever. Your choice grants you features at 3rd level and again at 7th, 15th, and 20th level.',
      },
      {
        level: 5,
        name: 'Extra Attack',
        description:
          'You can attack twice, instead of once, whenever you take the Attack action on your turn.',
      },
      {
        level: 6,
        name: 'Aura of Protection',
        description:
          'Whenever you or a friendly creature within 10 feet of you must make a saving throw, the creature gains a bonus to the saving throw equal to your Charisma modifier (with a minimum bonus of +1). You must be conscious to grant this bonus. At 18th level, the range of this aura increases to 30 feet.',
      },
      {
        level: 10,
        name: 'Aura of Courage',
        description:
          'You and friendly creatures within 10 feet of you cannot be frightened while you are conscious. At 18th level, the range of this aura increases to 30 feet.',
      },
      {
        level: 11,
        name: 'Improved Divine Smite',
        description:
          'You are so suffused with righteous might that all your melee weapon strikes carry divine power with them. Whenever you hit a creature with a melee weapon, the creature takes an extra 1d8 radiant damage.',
      },
      {
        level: 14,
        name: 'Cleansing Touch',
        description:
          'You can use your action to end one spell on yourself or on one willing creature that you touch. You can use this feature a number of times equal to your Charisma modifier (a minimum of once). You regain expended uses when you finish a long rest.',
      },
    ],
    spellcasting: {
      ability: 'Charisma',
      spellSlotProgression: HALF_CASTER_SLOTS,
      preparedFormula: 'level / 2 + charisma modifier',
    },
    subclassLevel: 3,
  },
  {
    name: 'Ranger',
    hitDie: 'd10',
    primaryAbilities: ['Dexterity', 'Wisdom'],
    savingThrows: ['Strength', 'Dexterity'],
    armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
    weaponProficiencies: ['Simple weapons', 'Martial weapons'],
    skillChoices: [
      'Animal Handling',
      'Athletics',
      'Insight',
      'Investigation',
      'Nature',
      'Perception',
      'Stealth',
      'Survival',
    ],
    toolProficiencies: [],
    numSkillChoices: 3,
    description: 'A warrior who combats threats on the edges of civilization.',
    features: [
      {
        level: 1,
        name: 'Favored Enemy',
        description:
          'You have significant experience studying, tracking, hunting, and even talking to a certain type of enemy. Choose a type of favored enemy: aberrations, beasts, celestials, constructs, dragons, elementals, fey, fiends, giants, monstrosities, oozes, plants, or undead. You have advantage on Wisdom (Survival) checks to track your favored enemies, as well as on Intelligence checks to recall information about them.',
      },
      {
        level: 1,
        name: 'Natural Explorer',
        description:
          'You are particularly familiar with one type of natural environment and are adept at traveling and surviving in such regions. You gain benefits when traveling through your favored terrain, including difficult terrain not slowing your group, you cannot become lost except by magical means, and you find twice as much food while foraging.',
      },
      {
        level: 2,
        name: 'Fighting Style',
        description:
          'You adopt a particular style of fighting as your specialty. Choose one of the following options: Archery, Defense, Dueling, or Two-Weapon Fighting.',
      },
      {
        level: 2,
        name: 'Spellcasting',
        description:
          'By the time you reach 2nd level, you have learned to use the magical essence of nature to cast spells. Wisdom is your spellcasting ability for your ranger spells.',
      },
      {
        level: 3,
        name: 'Ranger Archetype',
        description:
          'You choose an archetype that you strive to emulate. Your choice grants you features at 3rd level and again at 7th, 11th, and 15th level.',
      },
      {
        level: 3,
        name: 'Primeval Awareness',
        description:
          'You can use your action and expend one ranger spell slot to focus your awareness on the region around you. For 1 minute per level of the spell slot you expend, you can sense whether the following types of creatures are present within 1 mile of you: aberrations, celestials, dragons, elementals, fey, fiends, and undead.',
      },
      {
        level: 5,
        name: 'Extra Attack',
        description:
          'You can attack twice, instead of once, whenever you take the Attack action on your turn.',
      },
      {
        level: 8,
        name: "Land's Stride",
        description:
          'Moving through nonmagical difficult terrain costs you no extra movement. You can also pass through nonmagical plants without being slowed by them and without taking damage from them if they have thorns, spines, or a similar hazard.',
      },
      {
        level: 10,
        name: 'Hide in Plain Sight',
        description:
          'You can spend 1 minute creating camouflage for yourself. You must have access to fresh mud, dirt, plants, soot, and other naturally occurring materials with which to create your camouflage. Once camouflaged, you can try to hide by pressing yourself up against a solid surface that is at least as tall and wide as you are.',
      },
      {
        level: 14,
        name: 'Vanish',
        description:
          'You can use the Hide action as a bonus action on your turn. Also, you cannot be tracked by nonmagical means, unless you choose to leave a trail.',
      },
      {
        level: 18,
        name: 'Feral Senses',
        description:
          'You gain preternatural senses that help you fight creatures you cannot see. When you attack a creature you cannot see, your inability to see it does not impose disadvantage on your attack rolls against it. You are also aware of the location of any invisible creature within 30 feet of you.',
      },
      {
        level: 20,
        name: 'Foe Slayer',
        description:
          'You become an unparalleled hunter of your enemies. Once on each of your turns, you can add your Wisdom modifier to the attack roll or the damage roll of an attack you make against one of your favored enemies.',
      },
    ],
    spellcasting: {
      ability: 'Wisdom',
      spellSlotProgression: HALF_CASTER_SLOTS,
      spellsKnown: RANGER_SPELLS_KNOWN,
    },
    subclassLevel: 3,
  },
  {
    name: 'Rogue',
    hitDie: 'd8',
    primaryAbilities: ['Dexterity'],
    savingThrows: ['Dexterity', 'Intelligence'],
    armorProficiencies: ['Light armor'],
    weaponProficiencies: [
      'Simple weapons',
      'Hand crossbows',
      'Longswords',
      'Rapiers',
      'Shortswords',
    ],
    skillChoices: [
      'Acrobatics',
      'Athletics',
      'Deception',
      'Insight',
      'Intimidation',
      'Investigation',
      'Perception',
      'Performance',
      'Persuasion',
      'Sleight of Hand',
      'Stealth',
    ],
    toolProficiencies: ["Thieves' tools"],
    numSkillChoices: 4,
    description: 'A scoundrel who uses stealth and trickery to overcome obstacles and enemies.',
    features: [
      {
        level: 1,
        name: 'Expertise',
        description:
          "Choose two of your skill proficiencies, or one of your skill proficiencies and your proficiency with thieves' tools. Your proficiency bonus is doubled for any ability check you make that uses either of the chosen proficiencies. At 6th level, you can choose two more of your proficiencies to gain this benefit.",
      },
      {
        level: 1,
        name: 'Sneak Attack',
        description:
          "You know how to strike subtly and exploit a foe's distraction. Once per turn, you can deal extra damage to one creature you hit with an attack if you have advantage on the attack roll. The attack must use a finesse or a ranged weapon. The extra damage starts at 1d6 and increases as you gain levels.",
      },
      {
        level: 1,
        name: "Thieves' Cant",
        description:
          "During your rogue training you learned thieves' cant, a secret mix of dialect, jargon, and code that allows you to hide messages in seemingly normal conversation. It takes four times longer to convey such a message than it does to speak the same idea plainly.",
      },
      {
        level: 2,
        name: 'Cunning Action',
        description:
          'Your quick thinking and agility allow you to move and act quickly. You can take a bonus action on each of your turns in combat to take the Dash, Disengage, or Hide action.',
      },
      {
        level: 3,
        name: 'Roguish Archetype',
        description:
          'You choose an archetype that you emulate in the exercise of your rogue abilities. Your archetype choice grants you features at 3rd level and then again at 9th, 13th, and 17th level.',
      },
      {
        level: 5,
        name: 'Uncanny Dodge',
        description:
          "When an attacker that you can see hits you with an attack, you can use your reaction to halve the attack's damage against you.",
      },
      {
        level: 7,
        name: 'Evasion',
        description:
          'When you are subjected to an effect that allows you to make a Dexterity saving throw to take only half damage, you instead take no damage if you succeed on the saving throw, and only half damage if you fail.',
      },
      {
        level: 11,
        name: 'Reliable Talent',
        description:
          'You have refined your chosen skills until they approach perfection. Whenever you make an ability check that lets you add your proficiency bonus, you can treat a d20 roll of 9 or lower as a 10.',
      },
      {
        level: 14,
        name: 'Blindsense',
        description:
          'If you are able to hear, you are aware of the location of any hidden or invisible creature within 10 feet of you.',
      },
      {
        level: 15,
        name: 'Slippery Mind',
        description:
          'You have acquired greater mental strength. You gain proficiency in Wisdom saving throws.',
      },
      {
        level: 18,
        name: 'Elusive',
        description:
          'You are so evasive that attackers rarely gain the upper hand against you. No attack roll has advantage against you while you are not incapacitated.',
      },
      {
        level: 20,
        name: 'Stroke of Luck',
        description:
          'You have an uncanny knack for succeeding when you need to. If your attack misses a target within range, you can turn the miss into a hit. Alternatively, if you fail an ability check, you can treat the d20 roll as a 20.',
      },
    ],
    subclassLevel: 3,
  },
  {
    name: 'Sorcerer',
    hitDie: 'd6',
    primaryAbilities: ['Charisma'],
    savingThrows: ['Constitution', 'Charisma'],
    armorProficiencies: [],
    weaponProficiencies: ['Daggers', 'Darts', 'Slings', 'Quarterstaffs', 'Light crossbows'],
    skillChoices: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'],
    toolProficiencies: [],
    numSkillChoices: 2,
    description: 'A spellcaster who draws on inherent magic from a gift or bloodline.',
    features: [
      {
        level: 1,
        name: 'Spellcasting',
        description:
          'An event in your past, or in the life of a parent or ancestor, left an indelible mark on you, infusing you with arcane magic. Charisma is your spellcasting ability for your sorcerer spells.',
      },
      {
        level: 1,
        name: 'Sorcerous Origin',
        description:
          'Choose a sorcerous origin, which describes the source of your innate magical power. Your choice grants you features at 1st level and again at 6th, 14th, and 18th level.',
      },
      {
        level: 2,
        name: 'Font of Magic',
        description:
          'You tap into a deep wellspring of magic within yourself. This wellspring is represented by sorcery points, which allow you to create a variety of magical effects. You have a number of sorcery points equal to your sorcerer level. You can use sorcery points to gain additional spell slots, or sacrifice spell slots to gain additional sorcery points.',
      },
      {
        level: 3,
        name: 'Metamagic',
        description:
          'You gain the ability to twist your spells to suit your needs. You gain two Metamagic options of your choice. You gain another one at 10th and 17th level. You can use only one Metamagic option on a spell when you cast it, unless otherwise noted.',
      },
      {
        level: 20,
        name: 'Sorcerous Restoration',
        description: 'You regain 4 expended sorcery points whenever you finish a short rest.',
      },
    ],
    spellcasting: {
      ability: 'Charisma',
      spellSlotProgression: FULL_CASTER_SLOTS,
      cantripsKnown: CANTRIPS_4_5_6,
      spellsKnown: SORCERER_SPELLS_KNOWN,
    },
    subclassLevel: 1,
  },
  {
    name: 'Warlock',
    hitDie: 'd8',
    primaryAbilities: ['Charisma'],
    savingThrows: ['Wisdom', 'Charisma'],
    armorProficiencies: ['Light armor'],
    weaponProficiencies: ['Simple weapons'],
    skillChoices: [
      'Arcana',
      'Deception',
      'History',
      'Intimidation',
      'Investigation',
      'Nature',
      'Religion',
    ],
    toolProficiencies: [],
    numSkillChoices: 2,
    description: 'A wielder of magic that is derived from a bargain with an extraplanar entity.',
    features: [
      {
        level: 1,
        name: 'Otherworldly Patron',
        description:
          'You have struck a bargain with an otherworldly being of your choice. Your choice grants you features at 1st level and again at 6th, 10th, and 14th level.',
      },
      {
        level: 1,
        name: 'Pact Magic',
        description:
          'Your arcane research and the magic bestowed on you by your patron have given you facility with spells. Charisma is your spellcasting ability for your warlock spells. You know two cantrips and gain spell slots that recover on a short rest.',
      },
      {
        level: 2,
        name: 'Eldritch Invocations',
        description:
          'In your study of occult lore, you have unearthed eldritch invocations, fragments of forbidden knowledge that imbue you with an abiding magical ability. You gain two eldritch invocations of your choice. When you gain certain warlock levels, you gain additional invocations of your choice.',
      },
      {
        level: 3,
        name: 'Pact Boon',
        description:
          'Your otherworldly patron bestows a gift upon you for your loyal service. You gain one of the following features of your choice: Pact of the Chain, Pact of the Blade, or Pact of the Tome.',
      },
      {
        level: 11,
        name: 'Mystic Arcanum',
        description:
          'Your patron bestows upon you a magical secret called an arcanum. Choose one 6th-level spell from the warlock spell list as this arcanum. You can cast your arcanum spell once without expending a spell slot. You gain additional arcanum spells at higher levels.',
      },
      {
        level: 20,
        name: 'Eldritch Master',
        description:
          'You can draw on your inner reserve of mystical power while entreating your patron to regain expended spell slots. You can spend 1 minute entreating your patron for aid to regain all your expended Pact Magic spell slots. Once you use this feature, you must finish a long rest before you can use it again.',
      },
    ],
    spellcasting: {
      ability: 'Charisma',
      pactMagic: true,
      pactSlotProgression: PACT_MAGIC_SLOTS,
      cantripsKnown: CANTRIPS_2_3_4,
      spellsKnown: WARLOCK_SPELLS_KNOWN,
    },
    subclassLevel: 1,
  },
  {
    name: 'Wizard',
    hitDie: 'd6',
    primaryAbilities: ['Intelligence'],
    savingThrows: ['Intelligence', 'Wisdom'],
    armorProficiencies: [],
    weaponProficiencies: ['Daggers', 'Darts', 'Slings', 'Quarterstaffs', 'Light crossbows'],
    skillChoices: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'],
    toolProficiencies: [],
    numSkillChoices: 2,
    description: 'A scholarly magic-user capable of manipulating the structures of reality.',
    features: [
      {
        level: 1,
        name: 'Spellcasting',
        description:
          'As a student of arcane magic, you have a spellbook containing spells that show the first glimmerings of your true power. Intelligence is your spellcasting ability for your wizard spells.',
      },
      {
        level: 1,
        name: 'Arcane Recovery',
        description:
          'You have learned to regain some of your magical energy by studying your spellbook. Once per day when you finish a short rest, you can choose expended spell slots to recover. The spell slots can have a combined level that is equal to or less than half your wizard level (rounded up), and none of the slots can be 6th level or higher.',
      },
      {
        level: 2,
        name: 'Arcane Tradition',
        description:
          'You choose an arcane tradition, shaping your practice of magic through one of eight schools. Your choice grants you features at 2nd level and again at 6th, 10th, and 14th level.',
      },
      {
        level: 18,
        name: 'Spell Mastery',
        description:
          'You have achieved such mastery over certain spells that you can cast them at will. Choose a 1st-level wizard spell and a 2nd-level wizard spell that are in your spellbook. You can cast those spells at their lowest level without expending a spell slot when you have them prepared.',
      },
      {
        level: 20,
        name: 'Signature Spells',
        description:
          'You gain mastery over two powerful spells and can cast them with little effort. Choose two 3rd-level wizard spells in your spellbook as your signature spells. You always have these spells prepared, they do not count against the number of spells you have prepared, and you can cast each of them once at 3rd level without expending a spell slot.',
      },
    ],
    spellcasting: {
      ability: 'Intelligence',
      spellSlotProgression: FULL_CASTER_SLOTS,
      cantripsKnown: CANTRIPS_3_4_5,
      preparedFormula: 'level + intelligence modifier',
    },
    subclassLevel: 2,
  },
];
