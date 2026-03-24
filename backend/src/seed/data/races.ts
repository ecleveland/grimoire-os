export const srdRaces = [
  {
    name: 'Dwarf',
    speed: 25,
    size: 'Medium',
    abilityBonuses: { constitution: 2 },
    traits: [
      {
        name: 'Darkvision',
        description:
          'Accustomed to life underground, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You cannot discern color in darkness, only shades of gray.',
      },
      {
        name: 'Dwarven Resilience',
        description:
          'You have advantage on saving throws against poison, and you have resistance against poison damage.',
      },
      {
        name: 'Dwarven Combat Training',
        description:
          'You have proficiency with the battleaxe, handaxe, light hammer, and warhammer.',
      },
      {
        name: 'Tool Proficiency',
        description:
          "You gain proficiency with the artisan's tools of your choice: smith's tools, brewer's supplies, or mason's tools.",
      },
      {
        name: 'Stonecunning',
        description:
          'Whenever you make an Intelligence (History) check related to the origin of stonework, you are considered proficient in the History skill and add double your proficiency bonus to the check, instead of your normal proficiency bonus.',
      },
    ],
    languages: ['Common', 'Dwarvish'],
    description:
      'Bold and hardy, dwarves are known as skilled warriors, miners, and workers of stone and metal. They stand well under 5 feet tall but are broad and compact enough to weigh as much as a human standing nearly two feet taller.',
    age: 'Dwarves mature at the same rate as humans, but they are considered young until they reach the age of 50. On average, they live about 350 years.',
    alignment:
      'Most dwarves are lawful, believing firmly in the benefits of a well-ordered society. They tend toward good as well, with a strong sense of fair play and a belief that everyone deserves to share in the benefits of a just order.',
    sizeDescription: 'Dwarves stand between 4 and 5 feet tall and average about 150 pounds.',
  },
  {
    name: 'Elf',
    speed: 30,
    size: 'Medium',
    abilityBonuses: { dexterity: 2 },
    traits: [
      {
        name: 'Darkvision',
        description:
          'Accustomed to twilit forests and the night sky, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You cannot discern color in darkness, only shades of gray.',
      },
      {
        name: 'Keen Senses',
        description: 'You have proficiency in the Perception skill.',
      },
      {
        name: 'Fey Ancestry',
        description:
          'You have advantage on saving throws against being charmed, and magic cannot put you to sleep.',
      },
      {
        name: 'Trance',
        description:
          'Elves do not need to sleep. Instead, they meditate deeply, remaining semiconscious, for 4 hours a day. While meditating, you can dream after a fashion; such dreams are actually mental exercises that have become reflexive through years of practice. After resting in this way, you gain the same benefit that a human does from 8 hours of sleep.',
      },
    ],
    languages: ['Common', 'Elvish'],
    description:
      'Elves are a magical people of otherworldly grace, living in the world but not entirely part of it. They live in places of ethereal beauty, in the midst of ancient forests or in silvery spires glittering with faerie light.',
    age: 'Although elves reach physical maturity at about the same age as humans, the elven understanding of adulthood goes beyond physical growth to encompass worldly experience. An elf typically claims adulthood and an adult name around the age of 100 and can live to be 750 years old.',
    alignment:
      "Elves love freedom, variety, and self-expression, so they lean strongly toward the gentler aspects of chaos. They value and protect others' freedom as well as their own, and they are more often good than not.",
    sizeDescription: 'Elves range from under 5 to over 6 feet tall and have slender builds.',
  },
  {
    name: 'Halfling',
    speed: 25,
    size: 'Small',
    abilityBonuses: { dexterity: 2 },
    traits: [
      {
        name: 'Lucky',
        description:
          'When you roll a 1 on the d20 for an attack roll, ability check, or saving throw, you can reroll the die and must use the new roll.',
      },
      {
        name: 'Brave',
        description: 'You have advantage on saving throws against being frightened.',
      },
      {
        name: 'Halfling Nimbleness',
        description:
          'You can move through the space of any creature that is of a size larger than yours.',
      },
    ],
    languages: ['Common', 'Halfling'],
    description:
      'The diminutive halflings survive in a world full of larger creatures by avoiding notice or, barring that, avoiding offense. They are inclined to be stout, weighing between 40 and 45 pounds.',
    age: 'A halfling reaches adulthood at the age of 20 and generally lives into the middle of their second century.',
    alignment:
      'Most halflings are lawful good. As a rule, they are good-hearted and kind, hate to see others in pain, and have no tolerance for oppression.',
    sizeDescription: 'Halflings average about 3 feet tall and weigh about 40 pounds.',
  },
  {
    name: 'Human',
    speed: 30,
    size: 'Medium',
    abilityBonuses: {
      strength: 1,
      dexterity: 1,
      constitution: 1,
      intelligence: 1,
      wisdom: 1,
      charisma: 1,
    },
    traits: [
      {
        name: 'Extra Language',
        description: 'You can speak, read, and write one extra language of your choice.',
      },
    ],
    languages: ['Common'],
    description:
      'Humans are the most adaptable and ambitious people among the common races. Whatever drives them, humans are the innovators, the achievers, and the pioneers of the worlds.',
    age: 'Humans reach adulthood in their late teens and live less than a century.',
    alignment:
      'Humans tend toward no particular alignment. The best and the worst are found among them.',
    sizeDescription:
      'Humans vary widely in height and build, from barely 5 feet to well over 6 feet tall.',
  },
  {
    name: 'Dragonborn',
    speed: 30,
    size: 'Medium',
    abilityBonuses: { strength: 2, charisma: 1 },
    traits: [
      {
        name: 'Draconic Ancestry',
        description:
          'You have draconic ancestry. Choose one type of dragon from the Draconic Ancestry table. Your breath weapon and damage resistance are determined by the dragon type.',
      },
      {
        name: 'Breath Weapon',
        description:
          'You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation. When you use your breath weapon, each creature in the area of the exhalation must make a saving throw, the type of which is determined by your draconic ancestry. The DC equals 8 + your Constitution modifier + your proficiency bonus. A creature takes 2d6 damage on a failed save, and half as much damage on a successful one. The damage increases to 3d6 at 6th level, 4d6 at 11th level, and 5d6 at 16th level. You can use this feature once and regain the ability to do so after a short or long rest.',
      },
      {
        name: 'Damage Resistance',
        description:
          'You have resistance to the damage type associated with your draconic ancestry.',
      },
    ],
    languages: ['Common', 'Draconic'],
    description:
      'Born of dragons, dragonborn walk proudly through a world that greets them with fearful incomprehension. Shaped by draconic gods or the dragons themselves, they originally hatched from dragon eggs as a unique race.',
    age: 'Young dragonborn grow quickly. They walk hours after hatching, attain the size and development of a 10-year-old human child by the age of 3, and reach adulthood by 15. They live to be around 80.',
    alignment:
      'Dragonborn tend to extremes, making a conscious choice for one side or the other in the cosmic war between good and evil. Most dragonborn are good, but those who side with evil can be terrible villains.',
    sizeDescription:
      'Dragonborn are taller and heavier than humans, standing well over 6 feet tall and averaging almost 250 pounds.',
  },
  {
    name: 'Gnome',
    speed: 25,
    size: 'Small',
    abilityBonuses: { intelligence: 2 },
    traits: [
      {
        name: 'Darkvision',
        description:
          'Accustomed to life underground, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You cannot discern color in darkness, only shades of gray.',
      },
      {
        name: 'Gnome Cunning',
        description:
          'You have advantage on all Intelligence, Wisdom, and Charisma saving throws against magic.',
      },
    ],
    languages: ['Common', 'Gnomish'],
    description:
      "A gnome's energy and enthusiasm for living shines through every inch of their tiny body. Gnomes average slightly over 3 feet tall and weigh 40 to 45 pounds.",
    age: 'Gnomes mature at the same rate humans do, and most are expected to settle down into an adult life by around age 40. They can live 350 to almost 500 years.',
    alignment:
      'Gnomes are most often good. Those who tend toward law are sages, engineers, researchers, scholars, investigators, or inventors. Those who tend toward chaos are minstrels, tricksters, wanderers, or fanciful jewelers.',
    sizeDescription: 'Gnomes are between 3 and 4 feet tall and average about 40 pounds.',
  },
  {
    name: 'Half-Elf',
    speed: 30,
    size: 'Medium',
    abilityBonuses: { charisma: 2 },
    traits: [
      {
        name: 'Darkvision',
        description:
          'Thanks to your elf blood, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You cannot discern color in darkness, only shades of gray.',
      },
      {
        name: 'Fey Ancestry',
        description:
          'You have advantage on saving throws against being charmed, and magic cannot put you to sleep.',
      },
      {
        name: 'Skill Versatility',
        description: 'You gain proficiency in two skills of your choice.',
      },
    ],
    languages: ['Common', 'Elvish'],
    description:
      'Half-elves combine what some say are the best qualities of their elf and human parents: human curiosity, inventiveness, and ambition tempered by the refined senses, love of nature, and artistic tastes of the elves.',
    age: 'Half-elves mature at the same rate humans do and reach adulthood around the age of 20. They live much longer than humans, however, often exceeding 180 years.',
    alignment:
      'Half-elves share the chaotic bent of their elven heritage. They value both personal freedom and creative expression, demonstrating neither love of leaders nor desire for followers.',
    sizeDescription: 'Half-elves are about the same size as humans, ranging from 5 to 6 feet tall.',
  },
  {
    name: 'Half-Orc',
    speed: 30,
    size: 'Medium',
    abilityBonuses: { strength: 2, constitution: 1 },
    traits: [
      {
        name: 'Darkvision',
        description:
          'Thanks to your orc blood, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You cannot discern color in darkness, only shades of gray.',
      },
      {
        name: 'Menacing',
        description: 'You gain proficiency in the Intimidation skill.',
      },
      {
        name: 'Relentless Endurance',
        description:
          'When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead. You cannot use this feature again until you finish a long rest.',
      },
      {
        name: 'Savage Attacks',
        description:
          "When you score a critical hit with a melee weapon attack, you can roll one of the weapon's damage dice one additional time and add it to the extra damage of the critical hit.",
      },
    ],
    languages: ['Common', 'Orc'],
    description:
      "Half-orcs' grayish pigmentation, sloping foreheads, jutting jaws, prominent teeth, and towering builds make their orcish heritage plain for all to see.",
    age: 'Half-orcs mature a little faster than humans, reaching adulthood around age 14. They age noticeably faster and rarely live longer than 75 years.',
    alignment:
      'Half-orcs inherit a tendency toward chaos from their orc parents and are not strongly inclined toward good. Half-orcs raised among orcs and willing to live out their lives among them are usually evil.',
    sizeDescription:
      'Half-orcs are somewhat larger and bulkier than humans, and they range from 5 to well over 6 feet tall.',
  },
  {
    name: 'Tiefling',
    speed: 30,
    size: 'Medium',
    abilityBonuses: { intelligence: 1, charisma: 2 },
    traits: [
      {
        name: 'Darkvision',
        description:
          'Thanks to your infernal heritage, you have superior vision in dark and dim conditions. You can see in dim light within 60 feet of you as if it were bright light, and in darkness as if it were dim light. You cannot discern color in darkness, only shades of gray.',
      },
      {
        name: 'Hellish Resistance',
        description: 'You have resistance to fire damage.',
      },
      {
        name: 'Infernal Legacy',
        description:
          'You know the thaumaturgy cantrip. When you reach 3rd level, you can cast the hellish rebuke spell as a 2nd-level spell once with this trait and regain the ability to do so when you finish a long rest. When you reach 5th level, you can cast the darkness spell once with this trait and regain the ability to do so when you finish a long rest. Charisma is your spellcasting ability for these spells.',
      },
    ],
    languages: ['Common', 'Infernal'],
    description:
      'To be greeted with stares and whispers, to suffer violence and insult on the street, to see mistrust and fear in every eye: this is the lot of the tiefling.',
    age: 'Tieflings mature at the same rate as humans but live a few years longer.',
    alignment:
      'Tieflings might not have an innate tendency toward evil, but many of them end up there. Evil or not, an independent nature inclines many tieflings toward a chaotic alignment.',
    sizeDescription: 'Tieflings are about the same size and build as humans.',
  },
];
