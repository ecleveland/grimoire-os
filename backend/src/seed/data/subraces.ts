export const srdSubraces = [
  {
    name: "Hill Dwarf",
    raceName: "Dwarf",
    description:
      "As a hill dwarf, you have keen senses, deep intuition, and a resilience born of centuries of hard work and close connection to the earth.",
    abilityBonuses: { wisdom: 1 },
    traits: [
      {
        name: "Dwarven Toughness",
        description:
          "Your hit point maximum increases by 1, and it increases by 1 every time you gain a level.",
      },
    ],
  },
  {
    name: "High Elf",
    raceName: "Elf",
    description:
      "As a high elf, you have a keen mind and a mastery of at least the basics of magic. In many of the worlds of D&D, there are two kinds of high elves. One type is haughty and reclusive, believing themselves to be superior to non-elves. The other type is more common and more friendly, and often encountered among humans and other races.",
    abilityBonuses: { intelligence: 1 },
    traits: [
      {
        name: "Elf Weapon Training",
        description:
          "You have proficiency with the longsword, shortsword, shortbow, and longbow.",
      },
      {
        name: "Cantrip",
        description:
          "You know one cantrip of your choice from the wizard spell list. Intelligence is your spellcasting ability for it.",
      },
      {
        name: "Extra Language",
        description:
          "You can speak, read, and write one extra language of your choice.",
      },
    ],
  },
  {
    name: "Lightfoot Halfling",
    raceName: "Halfling",
    description:
      "As a lightfoot halfling, you can easily hide from notice, even using other people as cover. You are inclined to be affable and get along well with others. Lightfoots are more prone to wanderlust than other halflings, and often dwell alongside other races or take up a nomadic life.",
    abilityBonuses: { charisma: 1 },
    traits: [
      {
        name: "Naturally Stealthy",
        description:
          "You can attempt to hide even when you are obscured only by a creature that is at least one size larger than you.",
      },
    ],
  },
  {
    name: "Rock Gnome",
    raceName: "Gnome",
    description:
      "As a rock gnome, you have a natural inventiveness and hardiness beyond that of other gnomes. Most gnomes in the worlds of D&D are rock gnomes.",
    abilityBonuses: { constitution: 1 },
    traits: [
      {
        name: "Artificer's Lore",
        description:
          "Whenever you make an Intelligence (History) check related to magic items, alchemical objects, or technological devices, you can add twice your proficiency bonus, instead of any proficiency bonus you normally apply.",
      },
      {
        name: "Tinker",
        description:
          "You have proficiency with artisan's tools (tinker's tools). Using those tools, you can spend 1 hour and 10 gp worth of materials to construct a Tiny clockwork device (AC 5, 1 hp). The device ceases to function after 24 hours (unless you spend 1 hour repairing it to keep the device functioning), or when you use your action to dismantle it. You can have up to three such devices active at a time. When you create a device, choose one of the following options: Clockwork Toy, Fire Starter, or Music Box.",
      },
    ],
  },
];
