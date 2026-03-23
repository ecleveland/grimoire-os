export const srdItems = [
  {
    name: "Longsword",
    category: "Martial Melee Weapon",
    cost: "15 gp",
    weight: 3,
    description: "A versatile slashing weapon favored by many warriors.",
    damage: "1d8 slashing",
    properties: ["Versatile (1d10)"],
  },
  {
    name: "Shortbow",
    category: "Simple Ranged Weapon",
    cost: "25 gp",
    weight: 2,
    description:
      "A small bow suited for use in tight spaces or by smaller creatures.",
    damage: "1d6 piercing",
    properties: ["Ammunition (range 80/320)", "Two-handed"],
  },
  {
    name: "Chain Mail",
    category: "Heavy Armor",
    cost: "75 gp",
    weight: 55,
    description:
      "Made of interlocking metal rings, chain mail includes a layer of quilted fabric worn underneath to prevent chafing and to cushion the impact of blows. AC 16. Requires Strength 13.",
    properties: ["AC 16", "Stealth Disadvantage", "Requires Strength 13"],
  },
  {
    name: "Potion of Healing",
    category: "Potion",
    cost: "50 gp",
    weight: 0.5,
    description:
      "You regain 2d4 + 2 hit points when you drink this potion. The potion's red liquid glimmers when agitated.",
    properties: ["Consumable"],
  },
  {
    name: "Rope, Hempen (50 feet)",
    category: "Adventuring Gear",
    cost: "1 gp",
    weight: 10,
    description:
      "Rope has 2 hit points and can be burst with a DC 17 Strength check. Useful for climbing, binding prisoners, and countless other tasks.",
    properties: [],
  },
];
