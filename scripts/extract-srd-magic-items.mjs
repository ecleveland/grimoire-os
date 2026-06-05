#!/usr/bin/env node
/**
 * Repair the corrupt free-text descriptions in
 * docs/extracted-srd-json/magic_items.json from the SRD 5.2.1 PDF (VEG-272).
 *
 * WHY THIS EXISTS
 * ---------------
 * magic_items.json came from the same column-blind PDF extraction that corrupted
 * monsters.json (VEG-261) and spells.json (VEG-271). The structured fields
 * (category, rarity, requires_attunement) audit clean; the damage is confined to
 * the free-text `description`, in three forms — and magic items are the worst-hit
 * of the three because so many carry random/variant tables:
 *
 *   1. Flattened embedded tables (~25) — the SRD's two-column random/variant
 *      tables linearized into token soup (Deck of Illusions, Wand of Wonder, Bag
 *      of Tricks, Dragon Scale Mail, the Staff/Belt/Potion tiers, …).
 *   2. Interleave garble — a column fragment bled past the end of the prose
 *      (Headband of Intellect's "… higher without it." + dangling "on a" / "n").
 *   3. Raw, unreflowed column text — unlike spells.json, this file was never
 *      reflowed, so 149/257 descriptions carry end-of-line soft hyphens
 *      ("head-"+"band") and 146/257 carry mid-prose blank lines.
 *
 * HOW IT WORKS
 *   Every description is re-derived from the PDF via the shared column-aware core
 *   (scripts/lib/srd-pdf.mjs, VEG-270), which reads these items cleanly: the
 *   column-aware read drops the interleave garble (2) and resolves the wrapping
 *   (3) for free. The ~25 embedded tables (1) are spliced back in as GFM markdown
 *   authored from that same clean read — the column gaps collapse to single
 *   spaces under linearizeColumns, so the tables can't be auto-reconstructed and
 *   are curated here instead. They render via react-markdown + remark-gfm on the
 *   frontend, and the VEG-270 free-text guard (validateMagicItemData) passes.
 *
 * Only the `description` of each magic item is rewritten; every other field is
 * left byte-identical. Idempotent: re-running reproduces the same output.
 *
 * REQUIREMENTS: `pdftotext` (poppler).  macOS: `brew install poppler`.
 * USAGE:
 *   node scripts/extract-srd-magic-items.mjs            # repair in place
 *   node scripts/extract-srd-magic-items.mjs --dump "Bag of Tricks"  # raw lines
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bboxLayout, linearizeColumns } from './lib/srd-pdf.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PDF = path.join(ROOT, 'resources', 'SRD_CC_v5.2.1.pdf');
const OUT = path.join(ROOT, 'docs', 'extracted-srd-json', 'magic_items.json');

const normApos = s => s.replace(/[’‘]/g, "'");
const RARITY = /(Common|Uncommon|Rare|Very Rare|Legendary|Artifact|Varies)/;
const ATTUNE = /\(Requires Attunement/;

// Build a GFM markdown table from columns + rows, with an optional bold caption
// (used only where the SRD names the table, e.g. "Cube of Force Faces").
const gfm = (columns, rows, title) => {
  const head = `| ${columns.join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map(r => `| ${r.join(' | ')} |`).join('\n');
  const tbl = [head, sep, body].join('\n');
  return title ? `**${title}**\n\n${tbl}` : tbl;
};

// Reconstruct the ability-score grid of an embedded creature stat block (the
// Giant Fly in Figurine of Wondrous Power, the Avatar of Death in Mysterious
// Deck) — the column-blind read mangles "S tr 14 +2 +2 D ex …" into soup.
const abilityGrid = (score, mod, save) =>
  gfm(
    ['Ability', 'STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'],
    [
      ['Score', ...score],
      ['Mod', ...mod],
      ['Save', ...save],
    ]
  );

// ── Curated GFM tables, authored from the shared extractor's clean read of the
//    SRD PDF. Each table region in the re-derived description (the contiguous run
//    of raw block lines from `first` to `last`, inclusive) is replaced by `md`.
//    `end: true` marks a table that is the entry's last real content, so any
//    column-snake orphan bleed after `last` is dropped. Keyed by item name. ─────
const TABLES = {
  'Ammunition of Slaying': [
    {
      first: '1d100 Creature Type 1d100 Creature Type',
      last: '46–50 Humanoids 91–00 Undead',
      end: true,
      md: gfm(
        ['1d100', 'Creature Type'],
        [
          ['01–10', 'Aberrations'], ['11–15', 'Beasts'], ['16–20', 'Celestials'],
          ['21–25', 'Constructs'], ['26–35', 'Dragons'], ['36–45', 'Elementals'],
          ['46–50', 'Humanoids'], ['51–60', 'Fey'], ['61–70', 'Fiends'],
          ['71–75', 'Giants'], ['76–80', 'Monstrosities'], ['81–85', 'Oozes'],
          ['86–90', 'Plants'], ['91–00', 'Undead'],
        ]
      ),
    },
  ],
  'Amulet of the Planes': [
    {
      first: '1d100 Destination',
      last: '91–00 Random location on the Astral Plane',
      end: true,
      md: gfm(
        ['1d100', 'Destination'],
        [
          ['01–60', 'Random location on the plane you named'],
          ['61–70', 'Random location on an Inner Plane determined by rolling 1d6: on a 1, the Plane of Air; on a 2, the Plane of Earth; on a 3, the Plane of Fire; on a 4, the Plane of Water; on a 5, the Feywild; on a 6, the Shadowfell'],
          ['71–80', 'Random location on an Outer Plane determined by rolling 1d8: on a 1, Arborea; on a 2, Arcadia; on a 3, the Beastlands; on a 4, Bytopia; on a 5, Elysium; on a 6, Mechanus; on a 7, Mount Celestia; on an 8, Ysgard'],
          ['81–90', 'Random location on an Outer Plane determined by rolling 1d8: on a 1, the Abyss; on a 2, Acheron; on a 3, Carceri; on a 4, Gehenna; on a 5, Hades; on a 6, Limbo; on a 7, the Nine Hells; on an 8, Pandemonium'],
          ['91–00', 'Random location on the Astral Plane'],
        ]
      ),
    },
  ],
  'Apparatus of the Crab': [
    {
      first: 'Apparatus of the Crab Levers',
      last: '10 The rear hatch unseals and opens.',
      end: true,
      md: gfm(
        ['Lever', 'Up', 'Down'],
        [
          ['1', 'Legs extend, allowing the apparatus to walk and swim.', 'Legs retract, reducing the apparatus’s Speed and Swim Speed to 0 and making it unable to benefit from bonuses to speed.'],
          ['2', 'Forward window shutter opens.', 'Forward window shutter closes.'],
          ['3', 'Side window shutters open (two per side).', 'Side window shutters close (two per side).'],
          ['4', 'Two claws extend from the front side of the apparatus.', 'The claws retract.'],
          ['5', 'Each extended claw makes the following melee attack: +8 to hit, reach 5 ft. Hit: 7 (2d6) Bludgeoning damage.', 'Each extended claw makes the following melee attack: +8 to hit, reach 5 ft. Hit: The target has the Grappled condition (escape DC 15).'],
          ['6', 'The apparatus walks or swims forward provided its legs are extended.', 'The apparatus walks or swims backward provided its legs are extended.'],
          ['7', 'The apparatus turns 90 degrees counterclockwise provided its legs are extended.', 'The apparatus turns 90 degrees clockwise provided its legs are extended.'],
          ['8', 'Eyelike fixtures emit Bright Light in a 30-foot radius and Dim Light for an additional 30 feet.', 'The light turns off.'],
          ['9', 'The apparatus sinks up to 20 feet if it’s in liquid.', 'The apparatus rises up to 20 feet if it’s in liquid.'],
          ['10', 'The rear hatch unseals and opens.', 'The rear hatch closes and seals.'],
        ],
        'Apparatus of the Crab Levers'
      ),
    },
  ],
  'Armor of Resistance': [
    {
      first: '1d10 Damage Type 1d10 Damage Type',
      last: '5 Lightning 10 Thunder',
      end: true,
      md: gfm(
        ['1d10', 'Damage Type'],
        [
          ['1', 'Acid'], ['2', 'Cold'], ['3', 'Fire'], ['4', 'Force'], ['5', 'Lightning'],
          ['6', 'Necrotic'], ['7', 'Poison'], ['8', 'Psychic'], ['9', 'Radiant'], ['10', 'Thunder'],
        ]
      ),
    },
  ],
  'Bag of Beans': [
    {
      first: '1d100 Effect',
      last: 'of existence.',
      end: true,
      md: gfm(
        ['1d100', 'Effect'],
        [
          ['01', '5d4 toadstools sprout. If a creature eats a toadstool, roll any die. On an odd roll, the eater must succeed on a DC 15 Constitution saving throw or take 5d6 Poison damage and have the Poisoned condition for 1 hour. On an even roll, the eater gains 5d6 Temporary Hit Points for 1 hour.'],
          ['02–10', 'A geyser erupts and spouts water, beer, mayonnaise, tea, vinegar, wine, or oil (GM’s choice) 30 feet into the air for 1d4 minutes.'],
          ['11–20', 'A Treant sprouts. Roll any die. On an odd roll, the treant is Chaotic Evil. On an even roll, the treant is Chaotic Good.'],
          ['21–30', 'An animate but immobile stone statue in your likeness rises and makes verbal threats against you. If you leave it and others come near, it describes you as the most heinous of villains and directs the newcomers to find and attack you. If you are on the same plane of existence as the statue, it knows where you are. The statue becomes inanimate after 24 hours.'],
          ['31–40', 'A campfire with green flames springs forth and burns for 24 hours or until it is extinguished.'],
          ['41–50', 'Three Shrieker Fungi sprout.'],
          ['51–60', '1d4 + 4 bright-pink toads crawl forth. Whenever a toad is touched, it transforms into a Large or smaller monster of the GM’s choice that acts in accordance with its alignment and nature. The monster remains for 1 minute, then disappears in a puff of bright-pink smoke.'],
          ['61–70', 'A hungry Bulette burrows up and attacks.'],
          ['71–80', 'A fruit tree grows. It has 1d10 + 20 fruit, 1d8 of which act as randomly determined potions. The tree vanishes after 1 hour. Picked fruit remains, retaining any magic for 30 days.'],
          ['81–90', 'A nest of 1d4 + 3 rainbow-colored eggs springs up. Any creature that eats an egg makes a DC 20 Constitution saving throw. On a successful save, a creature permanently increases its lowest ability score by 1, randomly choosing among equally low scores. On a failed save, the creature takes 10d6 Force damage from an internal explosion.'],
          ['91–95', 'A pyramid with a 60-foot-square base bursts upward. Inside is a burial chamber containing a Mummy, a Mummy Lord, or some other Undead of the GM’s choice. Its sarcophagus contains treasure of the GM’s choice.'],
          ['96–00', 'A giant beanstalk sprouts, growing to a height of the GM’s choice. The top leads where the GM chooses, such as to a great view, a cloud giant’s castle, or another plane of existence.'],
        ]
      ),
    },
  ],
  'Bag of Tricks': [
    {
      first: 'Gray Bag of Tricks',
      last: '4 Axe Beak 8 Tiger',
      end: true,
      md: [
        gfm(['1d8', 'Creature'], [
          ['1', 'Weasel'], ['2', 'Giant Rat'], ['3', 'Badger'], ['4', 'Boar'],
          ['5', 'Panther'], ['6', 'Giant Badger'], ['7', 'Dire Wolf'], ['8', 'Giant Elk'],
        ], 'Gray Bag of Tricks'),
        gfm(['1d8', 'Creature'], [
          ['1', 'Rat'], ['2', 'Owl'], ['3', 'Mastiff'], ['4', 'Goat'],
          ['5', 'Giant Goat'], ['6', 'Giant Boar'], ['7', 'Lion'], ['8', 'Brown Bear'],
        ], 'Rust Bag of Tricks'),
        gfm(['1d8', 'Creature'], [
          ['1', 'Jackal'], ['2', 'Ape'], ['3', 'Baboon'], ['4', 'Axe Beak'],
          ['5', 'Black Bear'], ['6', 'Giant Weasel'], ['7', 'Giant Hyena'], ['8', 'Tiger'],
        ], 'Tan Bag of Tricks'),
      ].join('\n\n'),
    },
  ],
  'Belt of Giant Strength': [
    {
      first: 'Belt Str. Rarity',
      last: 'Belt of Giant Strength (storm) 29 Legendary',
      end: true,
      md: gfm(
        ['Belt', 'Str.', 'Rarity'],
        [
          ['Belt of Giant Strength (hill)', '21', 'Rare'],
          ['Belt of Giant Strength (frost or stone)', '23', 'Very Rare'],
          ['Belt of Giant Strength (fire)', '25', 'Very Rare'],
          ['Belt of Giant Strength (cloud)', '27', 'Legendary'],
          ['Belt of Giant Strength (storm)', '29', 'Legendary'],
        ]
      ),
    },
  ],
  'Candle of Invocation': [
    {
      first: '1d100 Outer Plane 1d100 Outer Plane',
      last: '47–54 Elysium 96–00 Ysgard',
      end: true,
      md: gfm(
        ['1d100', 'Outer Plane'],
        [
          ['01–05', 'Abyss'], ['06–10', 'Acheron'], ['11–17', 'Arborea'], ['18–25', 'Arcadia'],
          ['26–33', 'Beastlands'], ['34–41', 'Bytopia'], ['42–46', 'Carceri'], ['47–54', 'Elysium'],
          ['55–59', 'Gehenna'], ['60–64', 'Hades'], ['65–69', 'Limbo'], ['70–77', 'Mechanus'],
          ['78–85', 'Mount Celestia'], ['86–90', 'Nine Hells'], ['91–95', 'Pandemonium'], ['96–00', 'Ysgard'],
        ]
      ),
    },
  ],
  'Carpet of Flying': [
    {
      first: '1d100 Size Capacity Fly Speed',
      last: '81–00 6 ft. × 9 ft. 800 lb. 30 feet',
      end: true,
      md: gfm(
        ['1d100', 'Size', 'Capacity', 'Fly Speed'],
        [
          ['01–20', '3 ft. × 5 ft.', '200 lb.', '80 feet'],
          ['21–55', '4 ft. × 6 ft.', '400 lb.', '60 feet'],
          ['56–80', '5 ft. × 7 ft.', '600 lb.', '40 feet'],
          ['81–00', '6 ft. × 9 ft.', '800 lb.', '30 feet'],
        ]
      ),
    },
  ],
  'Cube of Force': [
    {
      first: 'Cube of Force Faces',
      last: 'Wall of Force 5',
      end: true,
      md: gfm(
        ['Spell', 'Charge Cost'],
        [
          ['Mage Armor', '1'], ['Shield', '1'], ['Tiny Hut', '3'],
          ['Private Sanctum', '4'], ['Resilient Sphere', '4'], ['Wall of Force', '5'],
        ],
        'Cube of Force Faces'
      ),
    },
  ],
  'Deck of Illusions': [
    {
      first: 'Deck of Illusions',
      last: '97–00 The card drawer',
      md: gfm(
        ['1d100', 'Illusion*'],
        [
          ['01–03', 'Adult Red Dragon'], ['04–06', 'Archmage'], ['07–09', 'Assassin'],
          ['10–12', 'Bandit Captain'], ['13–15', 'Basilisk'], ['16–18', 'Berserker'],
          ['19–21', 'Bugbear Warrior'], ['22–24', 'Cloud Giant'], ['25–27', 'Druid'],
          ['28–30', 'Erinyes'], ['31–33', 'Ettin'], ['34–36', 'Fire Giant'],
          ['37–39', 'Frost Giant'], ['40–42', 'Gnoll Warrior'], ['43–45', 'Goblin Warrior'],
          ['46–48', 'Guardian Naga'], ['49–51', 'Hill Giant'], ['52–54', 'Hobgoblin Warrior'],
          ['55–57', 'Incubus'], ['58–60', 'Iron Golem'], ['61–63', 'Knight'],
          ['64–66', 'Kobold Warrior'], ['67–69', 'Lich'], ['70–72', 'Medusa'],
          ['73–75', 'Night Hag'], ['76–78', 'Ogre'], ['79–81', 'Oni'],
          ['82–84', 'Priest'], ['85–87', 'Succubus'], ['88–90', 'Troll'],
          ['91–93', 'Veteran Warrior'], ['94–96', 'Wyvern'], ['97–00', 'The card drawer'],
        ],
        'Deck of Illusions'
      ),
    },
  ],
  'Dragon Orb': [
    {
      first: 'Spell Charge',
      last: 'Scrying (save DC 18) 3',
      md: gfm(
        ['Spell', 'Charge Cost'],
        [
          ['Cure Wounds (level 9 version)', '4'], ['Daylight', '1'], ['Death Ward', '2'],
          ['Detect Magic', '0'], ['Scrying (save DC 18)', '3'],
        ]
      ),
    },
  ],
  'Dragon Scale Mail': [
    {
      first: 'Dragon Resistance Dragon Resistance',
      last: 'Copper Acid White Cold',
      end: true,
      md: gfm(
        ['Dragon', 'Resistance'],
        [
          ['Black', 'Acid'], ['Blue', 'Lightning'], ['Brass', 'Fire'], ['Bronze', 'Lightning'],
          ['Copper', 'Acid'], ['Gold', 'Fire'], ['Green', 'Poison'], ['Red', 'Fire'],
          ['Silver', 'Cold'], ['White', 'Cold'],
        ]
      ),
    },
  ],
  'Efreeti Bottle': [
    {
      first: '1d10 Effect',
      last: 'loses its magic.',
      end: true,
      md: gfm(
        ['1d10', 'Effect'],
        [
          ['1', 'The efreeti attacks you. After fighting for 5 rounds, the efreeti disappears, and the bottle loses its magic.'],
          ['2–9', 'The efreeti understands your languages and obeys your commands for 1 hour, after which it returns to the bottle, and a new stopper contains it. The stopper can’t be removed for 24 hours. The next two times the bottle is opened, the same effect occurs. If the bottle is opened a fourth time, the efreeti escapes and disappears, and the bottle loses its magic.'],
          ['10', 'The efreeti understands your languages and can cast Wish once for you. It disappears when it grants the wish or after 1 hour, and the bottle loses its magic.'],
        ]
      ),
    },
  ],
  'Elemental Gem': [
    {
      first: 'Gem Summoned Elemental',
      last: 'Yellow diamond Earth Elemental',
      end: true,
      md: gfm(
        ['Gem', 'Summoned Elemental'],
        [
          ['Blue sapphire', 'Air Elemental'], ['Emerald', 'Water Elemental'],
          ['Red corundum', 'Fire Elemental'], ['Yellow diamond', 'Earth Elemental'],
        ]
      ),
    },
  ],
  'Feather Token': [
    {
      first: 'Feather Tokens',
      last: '91–00 Whip Rare',
      end: true,
      md: gfm(
        ['1d100', 'Token', 'Rarity'],
        [
          ['01–20', 'Anchor', 'Uncommon'], ['21–35', 'Bird', 'Rare'], ['36–50', 'Fan', 'Uncommon'],
          ['51–65', 'Swan boat', 'Rare'], ['66–90', 'Tree', 'Uncommon'], ['91–00', 'Whip', 'Rare'],
        ],
        'Feather Tokens'
      ),
    },
  ],
  'Figurine of Wondrous Power': [
    {
      first: 'Giant Fly',
      last: 'CR 0 (XP 0; PB +2)',
      md: [
        '**Giant Fly**',
        '',
        'Large Beast, Unaligned',
        '',
        '- **AC** 11',
        '- **Initiative** +1 (11)',
        '- **HP** 19 (3d10 + 3)',
        '- **Speed** 30 ft., Fly 60 ft.',
        '',
        abilityGrid(['14', '13', '13', '2', '10', '3'], ['+2', '+1', '+1', '−4', '+0', '−4'], ['+2', '+1', '+1', '−4', '+0', '−4']),
        '',
        '- **Senses** Darkvision 60 ft., Passive Perception 10',
        '- **Languages** None',
        '- **CR** 0 (XP 0; PB +2)',
      ].join('\n'),
    },
  ],
  'Hat of Many Spells': [
    {
      first: '1d100 Effect',
      last: 'destroyed before then.',
      end: true,
      md: gfm(
        ['1d100', 'Effect'],
        [
          ['01–50', 'You cast a random spell determined by rolling 1d10: on a 1, Enlarge/Reduce (enlarge effect); on a 2, Enlarge/Reduce (reduce effect); on a 3, Faerie Fire; on a 4, Fireball; on a 5, Gust of Wind; on a 6, Invisibility (cast on yourself); on a 7, Lightning Bolt; on an 8, Phantasmal Force; on a 9, Polymorph; on a 10, Stinking Cloud.'],
          ['51–55', 'You have the Stunned condition until the end of your next turn, believing something awesome just happened.'],
          ['56–60', 'A harmless swarm of butterflies fills a 10-foot Cube within 30 feet of yourself. The swarm disperses after 1 minute.'],
          ['61–65', 'You pull a nonmagical object out of the hat. Roll 1d4 to determine the object: on a 1, a vial of Acid; on a 2, a flask of Alchemist’s Fire; on a 3, a Crowbar; on a 4, a lit Torch.'],
          ['66–70', 'You suffer a bout of “magic sickness” and have the Poisoned condition for 1 hour.'],
          ['71–75', 'You have the Petrified condition until the end of your next turn.'],
          ['76–80', 'You pull a nonmagical object out of the hat. Roll 1d4 to determine the object: on a 1, a Dagger; on a 2, a Rope with a Grappling Hook tied to one end; on a 3, a bag of Caltrops; on a 4, a gem worth 50 GP.'],
          ['81–85', 'A creature appears in an unoccupied space as close to you as possible. The creature isn’t under your control and acts as it normally would, and it disappears after 1 hour or when it drops to 0 Hit Points. Roll 1d4 to determine the creature: on a 1, a Camel; on a 2, a Constrictor Snake; on a 3, an Elephant; on a 4, a Mule.'],
          ['86–90', 'A Hostile Swarm of Bats flies out of the hat, occupies your space, and attacks you.'],
          ['91–95', 'A vertical, 10-foot-diameter, two-way portal to another plane of existence opens in an unoccupied space within 30 feet of you and remains open until the end of your next turn. The GM determines where it leads.'],
          ['96–00', 'You pull a magic item out of the hat. Roll 1d6 to determine the item’s rarity: on a 1–3, Common; on a 4–5, Uncommon; on a 6, Rare. The GM chooses the item, which disappears after 1 hour if it’s not consumed or destroyed before then.'],
        ]
      ),
    },
  ],
  'Horn of Valhalla': [
    {
      first: '1d100 Horn Type Spirits Requirement',
      last: 'Martial weapons',
      end: true,
      md: gfm(
        ['1d100', 'Horn Type', 'Spirits', 'Requirement'],
        [
          ['01–40', 'Silver', '2', 'None'],
          ['41–75', 'Brass', '3', 'Proficiency with all Simple weapons'],
          ['76–90', 'Bronze', '4', 'Training with all Medium armor'],
          ['91–00', 'Iron', '5', 'Proficiency with all Martial weapons'],
        ]
      ),
    },
  ],
  'Manual of Golems': [
    {
      first: '1d20 Golem Time Cost',
      last: '19–20 Stone Golem 90 days 80,000 GP',
      end: true,
      md: gfm(
        ['1d20', 'Golem', 'Time', 'Cost'],
        [
          ['1–5', 'Clay Golem', '30 days', '65,000 GP'],
          ['6–17', 'Flesh Golem', '60 days', '50,000 GP'],
          ['18', 'Iron Golem', '120 days', '100,000 GP'],
          ['19–20', 'Stone Golem', '90 days', '80,000 GP'],
        ]
      ),
    },
  ],
  'Mysterious Deck': [
    {
      first: 'Mysterious Deck',
      last: '97–00 97–00 Void',
      md: gfm(
        ['1d100 (13-Card Deck)', '1d100 (22-Card Deck)', 'Card'],
        [
          ['—', '01–05', 'Balance'], ['—', '06–10', 'Comet'], ['—', '11–14', 'Donjon'],
          ['01–08', '15–18', 'Euryale'], ['—', '19–23', 'Fates'], ['09–16', '24–27', 'Flames'],
          ['—', '28–31', 'Fool'], ['—', '32–36', 'Gem'], ['17–24', '37–41', 'Jester'],
          ['25–32', '42–46', 'Key'], ['33–40', '47–51', 'Knight'], ['41–48', '52–56', 'Moon'],
          ['—', '57–60', 'Puzzle'], ['49–56', '61–64', 'Rogue'], ['57–64', '65–68', 'Ruin'],
          ['—', '69–73', 'Sage'], ['65–72', '74–77', 'Skull'], ['73–80', '78–82', 'Star'],
          ['81–88', '83–87', 'Sun'], ['—', '88–91', 'Talons'], ['89–96', '92–96', 'Throne'],
          ['97–00', '97–00', 'Void'],
        ],
        'Mysterious Deck'
      ),
    },
    {
      first: 'Avatar of Death',
      last: 'Necrotic damage.',
      end: true,
      md: [
        '**Avatar of Death**',
        '',
        'Medium Undead, Neutral Evil',
        '',
        '- **AC** 20',
        '- **Initiative** +3 (13)',
        '- **HP** Half the HP maximum of its summoner',
        '- **Speed** 60 ft., Fly 60 ft. (hover)',
        '',
        abilityGrid(['16', '16', '16', '16', '16', '16'], ['+3', '+3', '+3', '+3', '+3', '+3'], ['+3', '+3', '+3', '+3', '+3', '+3']),
        '',
        '- **Immunities** Necrotic, Poison; Charmed, Exhaustion, Frightened, Paralyzed, Petrified, Poisoned, Unconscious',
        '- **Senses** Truesight 60 ft., Passive Perception 13',
        '- **Languages** All languages known to its summoner',
        '- **CR** None (XP 0; PB equals its summoner’s)',
        '',
        '***Traits***',
        '',
        '***Incorporeal Movement.*** The avatar can move through other creatures and objects as if they were Difficult Terrain. It takes 5 (1d10) Force damage if it ends its turn inside an object.',
        '',
        '***Actions***',
        '',
        '***Multiattack.*** The avatar makes a number of Reaping Scythe attacks equal to half the summoner’s Proficiency Bonus (rounded up).',
        '',
        '***Reaping Scythe.*** Melee Attack Roll: Automatic hit, reach 5 ft. Hit: 7 (1d8 + 3) Slashing damage plus 4 (1d8) Necrotic damage.',
      ].join('\n'),
    },
  ],
  'Necklace of Prayer Beads': [
    {
      first: '1d20 Bead Spell',
      last: 'Walking',
      end: true,
      md: gfm(
        ['1d20', 'Bead', 'Spell'],
        [
          ['1–6', 'Bead of Blessing', 'Bless'],
          ['7–12', 'Bead of Curing', 'Cure Wounds (level 2 version)'],
          ['13–16', 'Bead of Favor', 'Greater Restoration'],
          ['17–18', 'Bead of Smiting', 'Shining Smite'],
          ['19', 'Bead of Summons', 'Guardian of Faith'],
          ['20', 'Bead of Wind Walking', 'Wind Walk'],
        ]
      ),
    },
  ],
  'Potion of Giant Strength': [
    {
      first: 'Potion Str. Rarity',
      last: 'Potion of Giant Strength (storm) 29 Legendary',
      end: true,
      md: gfm(
        ['Potion', 'Str.', 'Rarity'],
        [
          ['Potion of Giant Strength (hill)', '21', 'Uncommon'],
          ['Potion of Giant Strength (frost or stone)', '23', 'Rare'],
          ['Potion of Giant Strength (fire)', '25', 'Rare'],
          ['Potion of Giant Strength (cloud)', '27', 'Very Rare'],
          ['Potion of Giant Strength (storm)', '29', 'Legendary'],
        ]
      ),
    },
  ],
  'Potions of Healing': [
    {
      first: 'Potion HP Regained Rarity',
      last: '(supreme)',
      end: true,
      md: gfm(
        ['Potion', 'HP Regained', 'Rarity'],
        [
          ['Potion of Healing', '2d4 + 2', 'Common'],
          ['Potion of Healing (greater)', '4d4 + 4', 'Uncommon'],
          ['Potion of Healing (superior)', '8d4 + 8', 'Rare'],
          ['Potion of Healing (supreme)', '10d4 + 20', 'Very Rare'],
        ]
      ),
    },
  ],
  'Potion of Resistance': [
    {
      first: '1d10 Damage Type 1d10 Damage Type',
      last: '5 Lightning 10 Thunder',
      end: true,
      md: gfm(
        ['1d10', 'Damage Type'],
        [
          ['1', 'Acid'], ['2', 'Cold'], ['3', 'Fire'], ['4', 'Force'], ['5', 'Lightning'],
          ['6', 'Necrotic'], ['7', 'Poison'], ['8', 'Psychic'], ['9', 'Radiant'], ['10', 'Thunder'],
        ]
      ),
    },
  ],
  'Ring of Elemental Command': [
    {
      first: 'Plane Spells (Charges)',
      last: '(3 charges), Water Walk (2 charges)',
      end: true,
      md: gfm(
        ['Plane', 'Spells (Charges)'],
        [
          ['Air', 'Chain Lightning (3 charges), Feather Fall (0 charges), Gust of Wind (2 charges), Wind Wall (1 charge)'],
          ['Earth', 'Earthquake (5 charges), Stone Shape (2 charges), Stoneskin (3 charges), Wall of Stone (3 charges)'],
          ['Fire', 'Burning Hands (1 charge), Fireball (2 charges), Fire Storm (4 charges), Wall of Fire (3 charges)'],
          ['Water', 'Create or Destroy Water (1 charge), Ice Storm (2 charges), Tsunami (5 charges), Wall of Ice (3 charges), Water Walk (2 charges)'],
        ]
      ),
    },
  ],
  'Ring of Resistance': [
    {
      first: '1d10 Damage Type Gemstone',
      last: '10 Thunder Spinel',
      end: true,
      md: gfm(
        ['1d10', 'Damage Type', 'Gemstone'],
        [
          ['1', 'Acid', 'Pearl'], ['2', 'Cold', 'Tourmaline'], ['3', 'Fire', 'Garnet'],
          ['4', 'Force', 'Sapphire'], ['5', 'Lightning', 'Citrine'], ['6', 'Necrotic', 'Jet'],
          ['7', 'Poison', 'Amethyst'], ['8', 'Psychic', 'Jade'], ['9', 'Radiant', 'Topaz'],
          ['10', 'Thunder', 'Spinel'],
        ]
      ),
    },
  ],
  'Ring of Shooting Stars': [
    {
      first: 'Number of Lightning Number of Lightning',
      last: '2 5d4 4 2d4',
      md: gfm(
        ['Spheres', 'Damage'],
        [['1', '4d12'], ['2', '5d4'], ['3', '2d6'], ['4', '2d4']]
      ),
    },
  ],
  'Robe of Useful Items': [
    {
      first: '1d100 Patch',
      last: '97–00 Portable Ram',
      end: true,
      md: gfm(
        ['1d100', 'Patch'],
        [
          ['01–08', 'Bag of 100 GP'],
          ['09–15', 'Silver coffer (1 foot long, 6 inches wide and deep) worth 500 GP'],
          ['16–22', 'Iron door (up to 10 feet wide and 10 feet high, barred on one side of your choice), which you can place in an opening you can reach; it conforms to fit the opening, attaching and hinging itself'],
          ['23–30', '10 gems worth 100 GP each'],
          ['31–44', 'Wooden ladder (24 feet long)'],
          ['45–51', 'Riding Horse with a Riding Saddle'],
          ['52–59', 'Open pit (a 10-foot Cube), which you can place on the ground within 10 feet of yourself'],
          ['60–68', '4 Potions of Healing'],
          ['69–75', 'Rowboat (12 feet long)'],
          ['76–83', 'Spell Scroll containing one spell of level 1, 2, or 3 (your choice)'],
          ['84–90', '2 Mastiffs'],
          ['91–96', 'Window (2 feet by 4 feet, up to 2 feet deep), which you can place on a vertical surface you can reach'],
          ['97–00', 'Portable Ram'],
        ]
      ),
    },
  ],
  'Spell Scroll': [
    {
      first: 'Spell Level Rarity Save DC Attack Bonus',
      last: '9 Legendary 19 +11',
      md: gfm(
        ['Spell Level', 'Rarity', 'Save DC', 'Attack Bonus'],
        [
          ['Cantrip', 'Common', '13', '+5'], ['1', 'Common', '13', '+5'],
          ['2', 'Uncommon', '13', '+5'], ['3', 'Uncommon', '15', '+7'],
          ['4', 'Rare', '15', '+7'], ['5', 'Rare', '17', '+9'],
          ['6', 'Very Rare', '17', '+9'], ['7', 'Very Rare', '18', '+10'],
          ['8', 'Very Rare', '18', '+10'], ['9', 'Legendary', '19', '+11'],
        ]
      ),
    },
  ],
  'Sphere of Annihilation': [
    {
      first: '1d100 Result',
      last: 'to a random plane of existence.',
      end: true,
      md: gfm(
        ['1d100', 'Result'],
        [
          ['01–50', 'The sphere is destroyed.'],
          ['51–85', 'The sphere moves through the portal or into the extradimensional space.'],
          ['86–00', 'A spatial rift sends the sphere and each creature and object within 180 feet of the sphere to a random plane of existence.'],
        ]
      ),
    },
  ],
  'Staff of Fire': [
    {
      first: 'Charge Charge',
      last: 'Fireball 3',
      md: gfm(['Spell', 'Charge Cost'], [['Burning Hands', '1'], ['Fireball', '3'], ['Wall of Fire', '4']]),
    },
  ],
  'Staff of Frost': [
    {
      first: 'Charge Charge',
      last: 'Fog Cloud 1 Wall of Ice 4',
      md: gfm(['Spell', 'Charge Cost'], [
        ['Cone of Cold', '5'], ['Fog Cloud', '1'], ['Ice Storm', '4'], ['Wall of Ice', '4'],
      ]),
    },
  ],
  'Staff of Healing': [
    {
      first: 'Spell Charge Cost',
      last: 'Mass Cure Wounds 5',
      md: gfm(['Spell', 'Charge Cost'], [
        ['Cure Wounds', '1 charge per spell level (maximum 4 for a level 4 spell)'],
        ['Lesser Restoration', '2'],
        ['Mass Cure Wounds', '5'],
      ]),
    },
  ],
  'Staff of Power': [
    {
      first: 'Charge',
      last: 'Wall of Force 5',
      md: gfm(['Spell', 'Charge Cost'], [
        ['Cone of Cold', '5'], ['Fireball (level 5 version)', '5'], ['Globe of Invulnerability', '6'],
        ['Hold Monster', '5'], ['Levitate', '2'], ['Lightning Bolt (level 5 version)', '5'],
        ['Magic Missile', '1'], ['Ray of Enfeeblement', '1'], ['Wall of Force', '5'],
      ]),
    },
  ],
  'Staff of Swarming Insects': [
    {
      first: 'Spell Charge',
      last: 'Insect Plague 5',
      md: gfm(['Spell', 'Charge Cost'], [['Giant Insect', '4'], ['Insect Plague', '5']]),
    },
  ],
  'Staff of the Magi': [
    {
      first: 'Charge',
      last: 'Web 2',
      md: gfm(['Spell', 'Charge Cost'], [
        ['Arcane Lock', '0'], ['Conjure Elemental', '7'], ['Detect Magic', '0'], ['Dispel Magic', '3'],
        ['Enlarge/Reduce', '0'], ['Fireball (level 7 version)', '7'], ['Flaming Sphere', '2'],
        ['Ice Storm', '4'], ['Invisibility', '2'], ['Knock', '2'], ['Light', '0'],
        ['Lightning Bolt (level 7 version)', '7'], ['Mage Hand', '0'], ['Passwall', '5'],
        ['Plane Shift', '7'], ['Protection from Evil and Good', '0'], ['Telekinesis', '5'],
        ['Wall of Fire', '4'], ['Web', '2'],
      ]),
    },
  ],
  'Staff of the Woodlands': [
    {
      first: 'Spell Charge',
      last: 'Wall of Thorns 6',
      md: gfm(['Spell', 'Charge Cost'], [
        ['Animal Friendship', '1'], ['Awaken', '5'], ['Barkskin', '2'],
        ['Locate Animals or Plants', '2'], ['Pass without Trace', '2'], ['Speak with Animals', '1'],
        ['Speak with Plants', '3'], ['Wall of Thorns', '6'],
      ]),
    },
  ],
  'Wand of Binding': [
    {
      first: 'Spell Charge',
      last: 'Hold Person 2',
      md: gfm(['Spell', 'Charge Cost'], [['Hold Monster', '5'], ['Hold Person', '2']]),
    },
  ],
  'Wand of Fear': [
    {
      first: 'Charge',
      last: 'Fear (60-foot Cone) 3',
      md: gfm(['Spell', 'Charge Cost'], [
        ['Command (“flee” or “grovel” only)', '1'], ['Fear (60-foot Cone)', '3'],
      ]),
    },
  ],
  'Wand of Wonder': [
    {
      first: 'Wand of Wonder Effects',
      last: 'magic.',
      end: true,
      md: gfm(
        ['1d100', 'Effect'],
        [
          ['01–20', 'You cast a spell originating from the chosen point. Roll 1d10 to determine the spell: on a 1–2, Darkness; on a 3–4, Faerie Fire; on a 5–6, Fireball; on a 7–8, Slow; on a 9–10, Stinking Cloud.'],
          ['21–25', 'Nothing happens at the chosen point of origin. Instead, you have the Stunned condition until the start of your next turn, believing something awesome just happened.'],
          ['26–30', 'You cast Gust of Wind. The Line created by the spell extends from you to the chosen point of origin.'],
          ['31–35', 'Nothing happens at the chosen point of origin. Instead, you take 1d6 Psychic damage.'],
          ['36–40', 'Heavy rain falls for 1 minute in a 120-foot-high, 60-foot-radius Cylinder centered on the chosen point of origin. During that time, the area of effect is Lightly Obscured.'],
          ['41–45', 'A cloud of 600 oversized butterflies fills a 60-foot-high, 30-foot-radius Cylinder centered on the chosen point of origin. The butterflies remain for 10 minutes, during which time the area of effect is Heavily Obscured.'],
          ['46–50', 'You cast Lightning Bolt. The Line created by the spell extends from you to the chosen point of origin.'],
          ['51–55', 'The creature closest to the chosen point of origin is enlarged as if you had cast Enlarge/Reduce on it. If the target isn’t you and can’t be affected by that spell, you become the target instead.'],
          ['56–60', 'A magically formed creature appears in an unoccupied space as close to the chosen point of origin as possible. The creature isn’t under your control, acts as it normally would, and disappears after 1 hour or when it drops to 0 Hit Points. Roll 1d4 to determine which creature appears. On a 1, a Rhinoceros appears; on a 2, an Elephant appears; and on a 3–4, a Rat appears.'],
          ['61–64', 'Grass covers a 60-foot-radius circle of ground, with the center of that circle as close to the chosen point of origin as possible. Grass that’s already there grows to ten times its normal size and remains overgrown for 1 minute.'],
          ['65–68', 'An object of the GM’s choice disappears into the Ethereal Plane. The object must be neither worn nor carried, within 120 feet of the chosen point of origin, and no larger than 10 feet in any dimension. If there are no such objects in range, nothing happens.'],
          ['69–72', 'Nothing happens at the chosen point of origin. Instead, you shrink as if you had cast Enlarge/Reduce on yourself and remain in that state for 1 minute.'],
          ['73–77', 'Leaves grow from the creature nearest to the chosen point of origin. Unless they are picked off, the leaves turn brown and fall off after 24 hours.'],
          ['78–82', 'Nothing happens at the chosen point of origin. Instead, a burst of colorful, shimmering light extends from you in a 30-foot Emanation. Each creature in the area must succeed on a DC 15 Constitution saving throw or have the Blinded condition for 1 minute. A creature repeats the save at the end of each of its turns, ending the effect on itself on a success.'],
          ['83–87', 'Nothing happens at the chosen point of origin. Instead, you cast Invisibility on yourself.'],
          ['88–92', 'Nothing happens at the chosen point of origin. Instead, a stream of 1d4 × 10 gems, each worth 1 GP, shoots from the wand’s tip in a Line 30 feet long and 5 feet wide toward the chosen point of origin. Each gem deals 1 Bludgeoning damage, and the total damage of the gems is divided equally among all creatures in the Line.'],
          ['93–97', 'You cast Polymorph, targeting the creature closest to the chosen point of origin. Roll 1d4 to determine the target’s new form. On a 1, the new form is a Black Bear; on a 2, the new form is a Giant Wasp; on a 3–4, the new form is a Frog.'],
          ['98–00', 'The creature closest to the chosen point of origin makes a DC 15 Constitution saving throw. On a failed save, the creature has the Restrained condition and begins to turn to stone. While Restrained in this way, the creature repeats the save at the end of its next turn. On a successful save, the effect ends. On a failed save, the creature has the Petrified condition instead of the Restrained condition. The petrification lasts until the creature is freed by the Greater Restoration spell or similar magic.'],
        ],
        'Wand of Wonder Effects'
      ),
    },
  ],
};

// ── PDF block location ─────────────────────────────────────────────────────
// A magic-item entry is a name line (which may wrap across two lines) followed by
// a "Type, Rarity (Requires Attunement)" header that may itself wrap. The header
// ends at the line carrying the rarity (or its attunement tail); the description
// is the prose from there to the next entry's name.
function isHeaderStart(lines, i, names) {
  if (names.has(lines[i]) && headerFollows(lines, i + 1)) return { name: lines[i], headerAt: i + 1 };
  const two = `${lines[i]} ${lines[i + 1] ?? ''}`;
  if (names.has(two) && headerFollows(lines, i + 2)) return { name: two, headerAt: i + 2 };
  return null;
}
function headerFollows(lines, i) {
  for (let k = 0; k < 3 && i + k < lines.length; k++) {
    if (RARITY.test(lines[i + k]) || /^(Armor|Weapon|Wondrous Item|Ring|Rod|Staff|Wand|Potion|Scroll|Ammunition)/.test(lines[i + k]))
      return true;
  }
  return false;
}

// Index the first occurrence of every known item, in document order.
function indexBlocks(lines, names) {
  const found = new Map(); // name -> { start, headerAt }
  for (let i = 0; i < lines.length - 1; i++) {
    const hit = isHeaderStart(lines, i, names);
    if (hit && !found.has(hit.name)) found.set(hit.name, { start: i, headerAt: hit.headerAt });
  }
  return found;
}

// Walk the header lines (type + rarity, possibly wrapped) and return the index of
// the first description line — the line after the one carrying the rarity.
function descStartIndex(lines, headerAt) {
  let i = headerAt;
  // A wrapped rarity/variant clause: a bare wrapped rarity ("Uncommon"), a
  // rarity-by-variant tail ("or Very Rare (+3)"), or a parenthetical rarity list
  // ("(Bronze), or Legendary (Iron)").
  const isRarityCont = l =>
    (/^\(/.test(l) && RARITY.test(l)) ||
    (/^(or )/.test(l) && RARITY.test(l)) ||
    /^(Very )?(Rare|Uncommon|Legendary|Common|Artifact)\b/.test(l) ||
    /^(or )?\+\d/.test(l);
  // Consume up to a few header lines until one carries the rarity/attunement.
  for (let k = 0; k < 4 && i < lines.length; k++, i++) {
    if (RARITY.test(lines[i]) || ATTUNE.test(lines[i])) {
      while (i + 1 < lines.length && isRarityCont(lines[i + 1])) i++;
      // A "(Requires Attunement by a …)" clause can wrap across lines; consume
      // continuations until the parenthesis the header opened is closed.
      let open = (lines.slice(headerAt, i + 1).join(' ').match(/\(/g) || []).length;
      let close = (lines.slice(headerAt, i + 1).join(' ').match(/\)/g) || []).length;
      while (open > close && i + 1 < lines.length) {
        i++;
        open += (lines[i].match(/\(/g) || []).length;
        close += (lines[i].match(/\)/g) || []).length;
      }
      return i + 1;
    }
  }
  return headerAt + 1;
}

// Reflow PDF lines into the file's convention: one `\n` per source line, with
// end-of-line soft hyphens resolved ("head-"+"band" -> "headband").
function reflowLines(lines) {
  let out = '';
  for (let k = 0; k < lines.length; k++) {
    const piece = lines[k];
    if (k === 0) {
      out = piece;
      continue;
    }
    const lastTok = (out.match(/(\S+)$/) || ['', ''])[1];
    if (/[A-Za-z]-$/.test(out) && !/\d+-(foot|feet|mile)-$/i.test(lastTok)) {
      out = out.slice(0, -1) + piece; // soft word-break
    } else if (/-$/.test(out)) {
      out += piece; // dimension compound (e.g. "5-foot-")
    } else {
      out += '\n' + piece;
    }
  }
  return out;
}

// Re-derive a description from its raw block lines, splicing curated GFM tables.
// A table marked `end: true` is the last real content of the entry; everything
// after its `last` line is column-snake orphan bleed (e.g. the Apparatus of the
// Crab Levers "Down" column that lands after Armor of Resistance) and is dropped.
function buildDescription(name, descLines) {
  const tables = TABLES[name] ?? [];
  const findTable = line => tables.find(t => t.first === line);
  const segments = [];
  let i = 0;
  while (i < descLines.length) {
    const t = findTable(descLines[i]);
    if (t) {
      // For an `end` table the `last` marker may repeat (Efreeti Bottle's "loses
      // its magic." closes three rows); take the final occurrence so the whole
      // table is captured. Mid-description tables take the first occurrence.
      let j = -1;
      if (t.end) {
        for (let k = descLines.length - 1; k > i; k--) if (descLines[k] === t.last) { j = k; break; }
      } else {
        for (let k = i; k < descLines.length; k++) if (descLines[k] === t.last) { j = k; break; }
      }
      if (j === -1) {
        throw new Error(`${name}: table end "${t.last}" not found after "${t.first}"`);
      }
      segments.push(t.md);
      if (t.end) return segments.join('\n\n');
      i = j + 1;
    } else {
      const start = i;
      while (i < descLines.length && !findTable(descLines[i])) i++;
      const prose = reflowLines(descLines.slice(start, i));
      if (prose) segments.push(prose);
    }
  }
  return segments.join('\n\n');
}

// Collapse stray blank lines (the column-blind extraction left mid-prose gaps that
// render as spurious paragraph breaks). One blank line is preserved only where it
// separates a reconstructed GFM table or **bold title** from adjacent text.
function normalizeBlankLines(desc) {
  // A blank line is a meaningful markdown block boundary when it borders a table
  // row (`|`), a bold caption/heading (`**`), or a bullet line (`- `) — the latter
  // keeps the curated embedded stat blocks' lists from merging into the preceding
  // line. Mid-prose blank lines (the extraction artifacts) border none of these.
  const isStructural = l => {
    const t = l.trim();
    return t.startsWith('|') || t.startsWith('**') || t.startsWith('- ');
  };
  const lines = desc.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '') {
      out.push(lines[i]);
      continue;
    }
    let k = i + 1;
    while (k < lines.length && lines[k].trim() === '') k++;
    const prev = out.length ? out[out.length - 1] : '';
    const next = k < lines.length ? lines[k] : '';
    if (isStructural(prev) || isStructural(next)) out.push('');
    i = k - 1;
  }
  return out.join('\n').replace(/\s+$/, '');
}

function main() {
  const doc = JSON.parse(fs.readFileSync(OUT, 'utf8'));
  const byName = new Map(doc.magic_items.map(it => [it.name, it]));
  const names = new Set(byName.keys());

  const lines = linearizeColumns(bboxLayout(PDF));
  const blocks = indexBlocks(lines, names);

  // Ordered block starts, so each block ends at the next start. The last item
  // (Wings of Flying) has no following item, so cap the section at the "Monsters"
  // chapter heading; otherwise its description swallows the whole bestiary.
  const ordered = [...blocks.entries()].sort((a, b) => a[1].start - b[1].start);
  let sectionEnd = lines.findIndex((l, i) => l === 'Monsters' && lines[i + 1] === 'Stat Block Overview');
  if (sectionEnd === -1) sectionEnd = lines.length;
  const endOf = idx =>
    Math.min(idx + 1 < ordered.length ? ordered[idx + 1][1].start : lines.length, sectionEnd);

  const descLinesOf = name => {
    const pos = ordered.findIndex(([n]) => n === name);
    if (pos === -1) return null;
    const { headerAt } = ordered[pos][1];
    const start = descStartIndex(lines, headerAt);
    return lines.slice(start, endOf(pos));
  };

  // ── --dump mode: print a flagged item's raw description lines for authoring ──
  const dumpArg = process.argv.indexOf('--dump');
  if (dumpArg !== -1) {
    const name = process.argv[dumpArg + 1];
    const dl = descLinesOf(name);
    if (!dl) {
      console.error(`Not located in PDF: ${name}`);
      process.exit(1);
    }
    console.log(`=== ${name} (${dl.length} lines) ===`);
    dl.forEach((l, i) => console.log(String(i).padStart(3), JSON.stringify(l)));
    return;
  }

  let changed = 0;
  let missing = [];
  for (const it of doc.magic_items) {
    const dl = descLinesOf(it.name);
    if (!dl) {
      missing.push(it.name);
      continue;
    }
    const next = normalizeBlankLines(buildDescription(it.name, dl));
    if (next !== it.description) {
      it.description = next;
      changed++;
    }
  }

  if (missing.length) {
    console.warn(`WARNING: ${missing.length} items not located in PDF: ${missing.join(', ')}`);
  }

  let out = JSON.stringify(doc, null, 2);
  if (!out.endsWith('\n')) out += '\n';
  fs.writeFileSync(OUT, out);
  console.log(`Re-derived ${changed} magic-item descriptions -> ${path.relative(ROOT, OUT)}`);
}

main();
