export const srdSubclasses = [
  {
    name: 'Path of the Berserker',
    className: 'Barbarian',
    description:
      "For some barbarians, rage is a means to an end — that end being violence. The Path of the Berserker is a path of untrammeled fury, slick with blood. As you enter the berserker's rage, you thrill in the chaos of battle, heedless of your own health or well-being.",
    features: [
      {
        level: 3,
        name: 'Frenzy',
        description:
          'You can go into a frenzy when you rage. If you do so, for the duration of your rage you can make a single melee weapon attack as a bonus action on each of your turns after this one. When your rage ends, you suffer one level of exhaustion.',
      },
      {
        level: 6,
        name: 'Mindless Rage',
        description:
          'You cannot be charmed or frightened while raging. If you are charmed or frightened when you enter your rage, the effect is suspended for the duration of the rage.',
      },
      {
        level: 10,
        name: 'Intimidating Presence',
        description:
          'You can use your action to frighten someone with your menacing presence. When you do so, choose one creature that you can see within 30 feet of you. If the creature can see or hear you, it must succeed on a Wisdom saving throw (DC equal to 8 + your proficiency bonus + your Charisma modifier) or be frightened of you until the end of your next turn.',
      },
      {
        level: 14,
        name: 'Retaliation',
        description:
          'When you take damage from a creature that is within 5 feet of you, you can use your reaction to make a melee weapon attack against that creature.',
      },
    ],
  },
  {
    name: 'College of Lore',
    className: 'Bard',
    description:
      'Bards of the College of Lore know something about most things, collecting bits of knowledge from sources as diverse as scholarly tomes and peasant tales. Whether singing folk ballads in taverns or elaborate compositions in royal courts, these bards use their gifts to hold audiences spellbound.',
    features: [
      {
        level: 3,
        name: 'Bonus Proficiencies',
        description:
          'When you join the College of Lore at 3rd level, you gain proficiency with three skills of your choice.',
      },
      {
        level: 3,
        name: 'Cutting Words',
        description:
          "You learn how to use your wit to distract, confuse, and otherwise sap the confidence and competence of others. When a creature that you can see within 60 feet of you makes an attack roll, an ability check, or a damage roll, you can use your reaction to expend one of your uses of Bardic Inspiration, rolling a Bardic Inspiration die and subtracting the number rolled from the creature's roll.",
      },
      {
        level: 6,
        name: 'Additional Magical Secrets',
        description:
          'You learn two spells of your choice from any class. A spell you choose must be of a level you can cast, as shown on the Bard table, or a cantrip. The chosen spells count as bard spells for you but do not count against the number of bard spells you know.',
      },
      {
        level: 14,
        name: 'Peerless Skill',
        description:
          'When you make an ability check, you can expend one use of Bardic Inspiration. Roll a Bardic Inspiration die and add the number rolled to your ability check. You can choose to do so after rolling the die for the ability check, but before the DM tells you whether you succeed or fail.',
      },
    ],
  },
  {
    name: 'Life Domain',
    className: 'Cleric',
    description:
      'The Life domain focuses on the vibrant positive energy — one of the fundamental forces of the universe — that sustains all life. The gods of life promote vitality and health through healing the sick and wounded, caring for those in need, and driving away the forces of death and undeath.',
    features: [
      {
        level: 1,
        name: 'Bonus Proficiency',
        description:
          'When you choose this domain at 1st level, you gain proficiency with heavy armor.',
      },
      {
        level: 1,
        name: 'Disciple of Life',
        description:
          "Your healing spells are more effective. Whenever you use a spell of 1st level or higher to restore hit points to a creature, the creature regains additional hit points equal to 2 + the spell's level.",
      },
      {
        level: 2,
        name: 'Channel Divinity: Preserve Life',
        description:
          'You can use your Channel Divinity to heal the badly injured. As an action, you present your holy symbol and evoke healing energy that can restore a number of hit points equal to five times your cleric level. Choose any creatures within 30 feet of you, and divide those hit points among them. This feature can restore a creature to no more than half of its hit point maximum.',
      },
      {
        level: 6,
        name: 'Blessed Healer',
        description:
          "The healing spells you cast on others heal you as well. When you cast a spell of 1st level or higher that restores hit points to a creature other than you, you regain hit points equal to 2 + the spell's level.",
      },
      {
        level: 8,
        name: 'Divine Strike',
        description:
          'You gain the ability to infuse your weapon strikes with divine energy. Once on each of your turns when you hit a creature with a weapon attack, you can cause the attack to deal an extra 1d8 radiant damage to the target. When you reach 14th level, the extra damage increases to 2d8.',
      },
      {
        level: 17,
        name: 'Supreme Healing',
        description:
          'When you would normally roll one or more dice to restore hit points with a spell, you instead use the highest number possible for each die. For example, instead of restoring 2d6 hit points to a creature, you restore 12.',
      },
    ],
    spellList: [
      'Bless',
      'Cure Wounds',
      'Lesser Restoration',
      'Spiritual Weapon',
      'Beacon of Hope',
      'Revivify',
      'Death Ward',
      'Guardian of Faith',
      'Mass Cure Wounds',
      'Raise Dead',
    ],
  },
  {
    name: 'Circle of the Land',
    className: 'Druid',
    description:
      "The Circle of the Land is made up of mystics and sages who safeguard ancient knowledge and rites through a vast oral tradition. These druids meet within sacred circles of trees or standing stones to whisper primal secrets in Druidic. The circle's wisest members preside as the chief priests of communities that hold to the Old Faith.",
    features: [
      {
        level: 2,
        name: 'Bonus Cantrip',
        description: 'You learn one additional druid cantrip of your choice.',
      },
      {
        level: 2,
        name: 'Natural Recovery',
        description:
          'During a short rest, you choose expended spell slots to recover. The spell slots can have a combined level that is equal to or less than half your druid level (rounded up), and none of the slots can be 6th level or higher. You cannot use this feature again until you finish a long rest.',
      },
      {
        level: 3,
        name: 'Circle Spells',
        description:
          'Your mystical connection to the land infuses you with the ability to cast certain spells. You gain access to circle spells connected to the land where you became a druid. Once you gain access to a circle spell, you always have it prepared, and it does not count against the number of spells you can prepare each day.',
      },
      {
        level: 6,
        name: "Land's Stride",
        description:
          'Moving through nonmagical difficult terrain costs you no extra movement. You can also pass through nonmagical plants without being slowed by them and without taking damage from thorns, spines, or a similar hazard. In addition, you have advantage on saving throws against plants that are magically created or manipulated to impede movement.',
      },
      {
        level: 10,
        name: "Nature's Ward",
        description:
          'You cannot be charmed or frightened by elementals or fey, and you are immune to poison and disease.',
      },
      {
        level: 14,
        name: "Nature's Sanctuary",
        description:
          'Creatures of the natural world sense your connection to nature and become hesitant to attack you. When a beast or plant creature attacks you, that creature must make a Wisdom saving throw against your druid spell save DC. On a failed save, the creature must choose a different target, or the attack automatically misses.',
      },
    ],
  },
  {
    name: 'Champion',
    className: 'Fighter',
    description:
      'The archetypal Champion focuses on the development of raw physical power honed to deadly perfection. Those who model themselves on this archetype combine rigorous training with physical excellence to deal devastating blows.',
    features: [
      {
        level: 3,
        name: 'Improved Critical',
        description: 'Your weapon attacks score a critical hit on a roll of 19 or 20.',
      },
      {
        level: 7,
        name: 'Remarkable Athlete',
        description:
          'You can add half your proficiency bonus (round up) to any Strength, Dexterity, or Constitution check you make that does not already use your proficiency bonus. In addition, when you make a running long jump, the distance you can cover increases by a number of feet equal to your Strength modifier.',
      },
      {
        level: 10,
        name: 'Additional Fighting Style',
        description: 'You can choose a second option from the Fighting Style class feature.',
      },
      {
        level: 15,
        name: 'Superior Critical',
        description: 'Your weapon attacks score a critical hit on a roll of 18-20.',
      },
      {
        level: 18,
        name: 'Survivor',
        description:
          'You attain the pinnacle of resilience in battle. At the start of each of your turns, you regain hit points equal to 5 + your Constitution modifier if you have no more than half of your hit points left. You do not gain this benefit if you have 0 hit points.',
      },
    ],
  },
  {
    name: 'Way of the Open Hand',
    className: 'Monk',
    description:
      'Monks of the Way of the Open Hand are the ultimate masters of martial arts combat, whether armed or unarmed. They learn techniques to push and trip their opponents, manipulate ki to heal damage to their bodies, and practice advanced meditation that can protect them from harm.',
    features: [
      {
        level: 3,
        name: 'Open Hand Technique',
        description:
          'Whenever you hit a creature with one of the attacks granted by your Flurry of Blows, you can impose one of the following effects on that target: it must succeed on a Dexterity saving throw or be knocked prone; it must make a Strength saving throw or be pushed up to 15 feet away from you; or it cannot take reactions until the end of your next turn.',
      },
      {
        level: 6,
        name: 'Wholeness of Body',
        description:
          'You gain the ability to heal yourself. As an action, you can regain hit points equal to three times your monk level. You must finish a long rest before you can use this feature again.',
      },
      {
        level: 11,
        name: 'Tranquility',
        description:
          'You can enter a special meditation that surrounds you with an aura of peace. At the end of a long rest, you gain the effect of a sanctuary spell that lasts until the start of your next long rest (the spell can end early as normal). The saving throw DC for the spell equals 8 + your Wisdom modifier + your proficiency bonus.',
      },
      {
        level: 17,
        name: 'Quivering Palm',
        description:
          "You gain the ability to set up lethal vibrations in someone's body. When you hit a creature with an unarmed strike, you can spend 3 ki points to start these imperceptible vibrations, which last for a number of days equal to your monk level. You can then use your action to end the vibrations, and the creature must make a Constitution saving throw. If it fails, it is reduced to 0 hit points. If it succeeds, it takes 10d10 necrotic damage.",
      },
    ],
  },
  {
    name: 'Oath of Devotion',
    className: 'Paladin',
    description:
      'The Oath of Devotion binds a paladin to the loftiest ideals of justice, virtue, and order. Sometimes called cavaliers, white knights, or holy warriors, these paladins meet the ideal of the knight in shining armor, acting with honor in pursuit of justice and the greater good.',
    features: [
      {
        level: 3,
        name: 'Channel Divinity: Sacred Weapon',
        description:
          'As an action, you can imbue one weapon that you are holding with positive energy. For 1 minute, you add your Charisma modifier to attack rolls made with that weapon (with a minimum bonus of +1). The weapon also emits bright light in a 20-foot radius and dim light 20 feet beyond that.',
      },
      {
        level: 3,
        name: 'Channel Divinity: Turn the Unholy',
        description:
          'As an action, you present your holy symbol and speak a prayer censuring fiends and undead. Each fiend or undead that can see or hear you within 30 feet of you must make a Wisdom saving throw. If the creature fails its saving throw, it is turned for 1 minute or until it takes damage.',
      },
      {
        level: 7,
        name: 'Aura of Devotion',
        description:
          'You and friendly creatures within 10 feet of you cannot be charmed while you are conscious. At 18th level, the range of this aura increases to 30 feet.',
      },
      {
        level: 15,
        name: 'Purity of Spirit',
        description: 'You are always under the effects of a protection from evil and good spell.',
      },
      {
        level: 20,
        name: 'Holy Nimbus',
        description:
          'As an action, you can emanate an aura of sunlight. For 1 minute, bright light shines from you in a 30-foot radius, and dim light shines 30 feet beyond that. Whenever an enemy creature starts its turn in the bright light, the creature takes 10 radiant damage. In addition, for the duration, you have advantage on saving throws against spells cast by fiends or undead.',
      },
    ],
    spellList: [
      'Protection from Evil and Good',
      'Sanctuary',
      'Lesser Restoration',
      'Zone of Truth',
      'Beacon of Hope',
      'Dispel Magic',
      'Freedom of Movement',
      'Guardian of Faith',
      'Commune',
      'Flame Strike',
    ],
  },
  {
    name: 'Hunter',
    className: 'Ranger',
    description:
      "Emulating the Hunter archetype means accepting your place as a bulwark between civilization and the terrors of the wilderness. As you walk the Hunter's path, you learn specialized techniques for fighting the threats you face, from rampaging ogres and hordes of orcs to towering giants and terrifying dragons.",
    features: [
      {
        level: 3,
        name: "Hunter's Prey",
        description:
          'You gain one of the following features of your choice: Colossus Slayer (once per turn, when you hit a creature with a weapon attack, the creature takes an extra 1d8 damage if it is below its hit point maximum), Giant Killer (when a Large or larger creature within 5 feet of you hits or misses you with an attack, you can use your reaction to attack that creature), or Horde Breaker (once on each of your turns when you make a weapon attack, you can make another attack with the same weapon against a different creature within 5 feet of the original target).',
      },
      {
        level: 7,
        name: 'Defensive Tactics',
        description:
          'You gain one of the following features of your choice: Escape the Horde (opportunity attacks against you are made with disadvantage), Multiattack Defense (when a creature hits you with an attack, you gain a +4 bonus to AC against all subsequent attacks made by that creature for the rest of the turn), or Steel Will (you have advantage on saving throws against being frightened).',
      },
      {
        level: 11,
        name: 'Multiattack',
        description:
          "You gain one of the following features of your choice: Volley (you can use your action to make a ranged attack against any number of creatures within 10 feet of a point you can see within your weapon's normal range, making a separate attack roll for each target) or Whirlwind Attack (you can use your action to make a melee attack against any number of creatures within 5 feet of you, with a separate attack roll for each target).",
      },
      {
        level: 15,
        name: "Superior Hunter's Defense",
        description:
          'You gain one of the following features of your choice: Evasion (when you are subjected to an effect that allows you a Dexterity saving throw for half damage, you take no damage on a success and half on a failure), Stand Against the Tide (when a hostile creature misses you with a melee attack, you can use your reaction to force that creature to repeat the same attack against another creature of your choice), or Uncanny Dodge (when an attacker that you can see hits you with an attack, you can use your reaction to halve the damage).',
      },
    ],
  },
  {
    name: 'Thief',
    className: 'Rogue',
    description:
      'You hone your skills in the larcenous arts. Burglars, bandits, cutpurses, and other criminals typically follow this archetype, but so do rogues who prefer to think of themselves as professional treasure seekers, explorers, delvers, and investigators.',
    features: [
      {
        level: 3,
        name: 'Fast Hands',
        description:
          "You can use the bonus action granted by your Cunning Action to make a Dexterity (Sleight of Hand) check, use your thieves' tools to disarm a trap or open a lock, or take the Use an Object action.",
      },
      {
        level: 3,
        name: 'Second-Story Work',
        description:
          'You gain the ability to climb faster than normal; climbing no longer costs you extra movement. In addition, when you make a running jump, the distance you cover increases by a number of feet equal to your Dexterity modifier.',
      },
      {
        level: 9,
        name: 'Supreme Stealth',
        description:
          'You have advantage on a Dexterity (Stealth) check if you move no more than half your speed on the same turn.',
      },
      {
        level: 13,
        name: 'Use Magic Device',
        description:
          'You have learned enough about the workings of magic that you can improvise the use of items even when they are not intended for you. You ignore all class, race, and level requirements on the use of magic items.',
      },
      {
        level: 17,
        name: "Thief's Reflexes",
        description:
          'You have become adept at laying ambushes and quickly escaping danger. You can take two turns during the first round of any combat. You take your first turn at your normal initiative and your second turn at your initiative minus 10.',
      },
    ],
  },
  {
    name: 'Draconic Bloodline',
    className: 'Sorcerer',
    description:
      'Your innate magic comes from draconic magic that was mingled with your blood or that of your ancestors. Most often, sorcerers with this origin trace their descent back to a mighty sorcerer of ancient times who made a bargain with a dragon or who might even have claimed a dragon parent.',
    features: [
      {
        level: 1,
        name: 'Dragon Ancestor',
        description:
          'You choose one type of dragon as your ancestor. The damage type associated with each dragon is used by features you gain later. You can speak, read, and write Draconic. Additionally, whenever you make a Charisma check when interacting with dragons, your proficiency bonus is doubled if it applies to the check.',
      },
      {
        level: 1,
        name: 'Draconic Resilience',
        description:
          'As magic flows through your body, it causes physical traits of your dragon ancestors to emerge. At 1st level, your hit point maximum increases by 1 and increases by 1 again whenever you gain a level in this class. Additionally, parts of your skin are covered by a thin sheen of dragon-like scales. When you are not wearing armor, your AC equals 13 + your Dexterity modifier.',
      },
      {
        level: 6,
        name: 'Elemental Affinity',
        description:
          'When you cast a spell that deals damage of the type associated with your draconic ancestry, you can add your Charisma modifier to one damage roll of that spell. At the same time, you can spend 1 sorcery point to gain resistance to that damage type for 1 hour.',
      },
      {
        level: 14,
        name: 'Dragon Wings',
        description:
          'You gain the ability to sprout a pair of dragon wings from your back, gaining a flying speed equal to your current speed. You can create these wings as a bonus action on your turn. They last until you dismiss them as a bonus action on your turn. You cannot manifest your wings while wearing armor unless the armor is made to accommodate them.',
      },
      {
        level: 18,
        name: 'Draconic Presence',
        description:
          'You can channel the dread presence of your dragon ancestor, causing those around you to become awestruck or frightened. As an action, you can spend 5 sorcery points to draw on this power and exude an aura of awe or fear (your choice) to a distance of 60 feet. Each hostile creature in that area must succeed on a Wisdom saving throw or be charmed (if you chose awe) or frightened (if you chose fear) for 1 minute.',
      },
    ],
  },
  {
    name: 'The Fiend',
    className: 'Warlock',
    description:
      'You have made a pact with a fiend from the lower planes of existence, a being whose aims are evil, even if you strive against those aims. Such beings desire the corruption or destruction of all things, ultimately including you.',
    features: [
      {
        level: 1,
        name: "Dark One's Blessing",
        description:
          'When you reduce a hostile creature to 0 hit points, you gain temporary hit points equal to your Charisma modifier + your warlock level (minimum of 1).',
      },
      {
        level: 6,
        name: "Dark One's Own Luck",
        description:
          "You can call on your patron to alter fate in your favor. When you make an ability check or a saving throw, you can use this feature to add a d10 to your roll. You can do so after seeing the initial roll but before any of the roll's effects occur. Once you use this feature, you cannot use it again until you finish a short or long rest.",
      },
      {
        level: 10,
        name: 'Fiendish Resilience',
        description:
          'You can choose one damage type when you finish a short or long rest. You gain resistance to that damage type until you choose a different one with this feature. Damage from magical weapons or silver weapons ignores this resistance.',
      },
      {
        level: 14,
        name: 'Hurl Through Hell',
        description:
          'When you hit a creature with an attack, you can use this feature to instantly transport the target through the lower planes. The creature disappears and hurtles through a nightmare landscape. At the end of your next turn, the target returns to the space it previously occupied, or the nearest unoccupied space. If the target is not a fiend, it takes 10d10 psychic damage as it reels from its horrific experience. Once you use this feature, you cannot use it again until you finish a long rest.',
      },
    ],
    spellList: [
      'Burning Hands',
      'Command',
      'Blindness/Deafness',
      'Scorching Ray',
      'Fireball',
      'Stinking Cloud',
      'Fire Shield',
      'Wall of Fire',
      'Flame Strike',
      'Hallow',
    ],
  },
  {
    name: 'School of Evocation',
    className: 'Wizard',
    description:
      'You focus your study on magic that creates powerful elemental effects such as bitter cold, searing flame, rolling thunder, crackling lightning, and burning acid. Some evokers find employment in military forces, serving as artillery to blast enemy armies from afar.',
    features: [
      {
        level: 2,
        name: 'Evocation Savant',
        description:
          'The gold and time you must spend to copy an evocation spell into your spellbook is halved.',
      },
      {
        level: 2,
        name: 'Sculpt Spells',
        description:
          "You can create pockets of relative safety within the effects of your evocation spells. When you cast an evocation spell that affects other creatures that you can see, you can choose a number of them equal to 1 + the spell's level. The chosen creatures automatically succeed on their saving throws against the spell, and they take no damage if they would normally take half damage on a successful save.",
      },
      {
        level: 6,
        name: 'Potent Cantrip',
        description:
          "Your damaging cantrips affect even creatures that avoid the brunt of the effect. When a creature succeeds on a saving throw against your cantrip, the creature takes half the cantrip's damage (if any) but suffers no additional effect from the cantrip.",
      },
      {
        level: 10,
        name: 'Empowered Evocation',
        description:
          'You can add your Intelligence modifier to one damage roll of any wizard evocation spell you cast.',
      },
      {
        level: 14,
        name: 'Overchannel',
        description:
          'You can increase the power of your simpler spells. When you cast a wizard spell of 1st through 5th level that deals damage, you can deal maximum damage with that spell. The first time you do so, you suffer no adverse effect. If you use this feature again before you finish a long rest, you take 2d12 necrotic damage for each level of the spell, immediately after you cast it, increasing by 1d12 per subsequent use.',
      },
    ],
  },
];
