export const srdRaces = [
  {
    name: 'Dwarf',
    speed: 25,
    size: 'Medium',
    abilityBonuses: { constitution: 2 },
    traits: ['Darkvision', 'Dwarven Resilience', 'Dwarven Combat Training', 'Stonecunning'],
    languages: ['Common', 'Dwarvish'],
    description:
      'Bold and hardy, dwarves are known as skilled warriors, miners, and workers of stone and metal. They stand well under 5 feet tall but are broad and compact enough to weigh as much as a human standing nearly two feet taller.',
  },
  {
    name: 'Elf',
    speed: 30,
    size: 'Medium',
    abilityBonuses: { dexterity: 2 },
    traits: ['Darkvision', 'Keen Senses', 'Fey Ancestry', 'Trance'],
    languages: ['Common', 'Elvish'],
    description:
      'Elves are a magical people of otherworldly grace, living in the world but not entirely part of it. They live in places of ethereal beauty, in the midst of ancient forests or in silvery spires glittering with faerie light.',
  },
  {
    name: 'Halfling',
    speed: 25,
    size: 'Small',
    abilityBonuses: { dexterity: 2 },
    traits: ['Lucky', 'Brave', 'Halfling Nimbleness'],
    languages: ['Common', 'Halfling'],
    description:
      'The diminutive halflings survive in a world full of larger creatures by avoiding notice or, barring that, avoiding offense. They are inclined to be stout, weighing between 40 and 45 pounds.',
  },
  {
    name: 'Human',
    speed: 30,
    size: 'Medium',
    abilityBonuses: { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1 },
    traits: ['Extra Language'],
    languages: ['Common'],
    description:
      'Humans are the most adaptable and ambitious people among the common races. Whatever drives them, humans are the innovators, the achievers, and the pioneers of the worlds.',
  },
  {
    name: 'Dragonborn',
    speed: 30,
    size: 'Medium',
    abilityBonuses: { strength: 2, charisma: 1 },
    traits: ['Draconic Ancestry', 'Breath Weapon', 'Damage Resistance'],
    languages: ['Common', 'Draconic'],
    description:
      'Born of dragons, dragonborn walk proudly through a world that greets them with fearful incomprehension. Shaped by draconic gods or the dragons themselves, they originally hatched from dragon eggs as a unique race.',
  },
  {
    name: 'Gnome',
    speed: 25,
    size: 'Small',
    abilityBonuses: { intelligence: 2 },
    traits: ['Darkvision', 'Gnome Cunning'],
    languages: ['Common', 'Gnomish'],
    description:
      'A gnome\'s energy and enthusiasm for living shines through every inch of their tiny body. Gnomes average slightly over 3 feet tall and weigh 40 to 45 pounds.',
  },
  {
    name: 'Half-Elf',
    speed: 30,
    size: 'Medium',
    abilityBonuses: { charisma: 2 },
    traits: ['Darkvision', 'Fey Ancestry', 'Skill Versatility'],
    languages: ['Common', 'Elvish'],
    description:
      'Half-elves combine what some say are the best qualities of their elf and human parents: human curiosity, inventiveness, and ambition tempered by the refined senses, love of nature, and artistic tastes of the elves.',
  },
  {
    name: 'Half-Orc',
    speed: 30,
    size: 'Medium',
    abilityBonuses: { strength: 2, constitution: 1 },
    traits: ['Darkvision', 'Menacing', 'Relentless Endurance', 'Savage Attacks'],
    languages: ['Common', 'Orc'],
    description:
      'Half-orcs\' grayish pigmentation, sloping foreheads, jutting jaws, prominent teeth, and towering builds make their orcish heritage plain for all to see.',
  },
  {
    name: 'Tiefling',
    speed: 30,
    size: 'Medium',
    abilityBonuses: { intelligence: 1, charisma: 2 },
    traits: ['Darkvision', 'Hellish Resistance', 'Infernal Legacy'],
    languages: ['Common', 'Infernal'],
    description:
      'To be greeted with stares and whispers, to suffer violence and insult on the street, to see mistrust and fear in every eye: this is the lot of the tiefling.',
  },
];
