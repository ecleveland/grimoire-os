export const srdSpecies = [
  {
    name: "Dragonborn",
    speed: 30,
    size: "Medium",
    traits: [
      {
        name: "Draconic Ancestry",
        description:
          "Your lineage stems from a dragon progenitor. Choose the kind of dragon from the Draconic Ancestors table. Your choice affects your Breath Weapon and Damage Resistance traits as well as your appearance.",
      },
      {
        name: "Breath Weapon",
        description:
          "When you take the Attack action on your turn, you can replace one of your attacks with an exhalation of magical energy in either a 15-foot Cone or a 30-foot Line that is 5 feet wide (choose the shape each time). Each creature in that area must make a Dexterity saving throw (DC 8 plus your Constitution modifier and Proficiency Bonus). On a failed save, a creature takes 1d10 damage of the type determined by your Draconic Ancestry trait. On a successful save, a creature takes half as much damage. This damage increases by 1d10 when you reach character levels 5 (2d10), 11 (3d10), and 17 (4d10). You can use this Breath Weapon a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Long Rest.",
      },
      {
        name: "Damage Resistance",
        description:
          "You have Resistance to the damage type determined by your Draconic Ancestry trait.",
      },
      {
        name: "Darkvision",
        description: "You have Darkvision with a range of 60 feet.",
      },
      {
        name: "Draconic Flight",
        description:
          "When you reach character level 5, you can channel draconic magic to give yourself temporary flight. As a Bonus Action, you sprout spectral wings on your back that last for 10 minutes or until you retract the wings (no action required) or have the Incapacitated condition. During that time, you have a Fly Speed equal to your Speed. Your wings appear to be made of the same energy as your Breath Weapon. Once you use this trait, you can't use it again until you finish a Long Rest.",
      },
    ],
    description:
      "Creature Type: Humanoid. Size: Medium (about 5\u20137 feet tall). As a Dragonborn, you have these special traits.",
  },
  {
    name: "Dwarf",
    speed: 30,
    size: "Medium",
    traits: [
      {
        name: "Darkvision",
        description: "You have Darkvision with a range of 120 feet.",
      },
      {
        name: "Dwarven Resilience",
        description:
          "You have Resistance to Poison damage. You also have Advantage on saving throws you make to avoid or end the Poisoned condition.",
      },
      {
        name: "Dwarven Toughness",
        description:
          "Your Hit Point maximum increases by 1, and it increases by 1 again whenever you gain a level.",
      },
      {
        name: "Stonecunning",
        description:
          "As a Bonus Action, you gain Tremorsense with a range of 60 feet for 10 minutes. You must be on a stone surface or touching a stone surface to use this Tremorsense. The stone can be natural or worked. You can use this Bonus Action a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Long Rest.",
      },
    ],
    description:
      "Creature Type: Humanoid. Size: Medium (about 4\u20135 feet tall). As a Dwarf, you have these special traits.",
  },
  {
    name: "Elf",
    speed: 30,
    size: "Medium",
    traits: [
      {
        name: "Darkvision",
        description: "You have Darkvision with a range of 60 feet.",
      },
      {
        name: "Elven Lineage",
        description:
          "You are part of a lineage that grants you supernatural abilities. Choose a lineage from the Elven Lineages table: Drow (the range of your Darkvision increases to 120 feet, you also know the Dancing Lights cantrip; Faerie Fire at level 3; Darkness at level 5), High Elf (you know the Prestidigitation cantrip, whenever you finish a Long Rest you can replace that cantrip with a different cantrip from the Wizard spell list; Detect Magic at level 3; Misty Step at level 5), or Wood Elf (your Speed increases to 35 feet, you also know the Druidcraft cantrip; Longstrider at level 3; Pass without Trace at level 5). You gain the level 1 benefit of that lineage. When you reach character levels 3 and 5, you learn a higher-level spell, as shown on the table. You always have that spell prepared. You can cast it once without a spell slot, and you regain the ability to cast it in that way when you finish a Long Rest. You can also cast the spell using any spell slots you have of the appropriate level. Intelligence, Wisdom, or Charisma is your spellcasting ability for the spells you cast with this trait (choose the ability when you select the lineage).",
      },
      {
        name: "Fey Ancestry",
        description:
          "You have Advantage on saving throws you make to avoid or end the Charmed condition.",
      },
      {
        name: "Keen Senses",
        description:
          "You have proficiency in the Insight, Perception, or Survival skill.",
      },
      {
        name: "Trance",
        description:
          "You don't need to sleep, and magic can't put you to sleep. You can finish a Long Rest in 4 hours if you spend those hours in a trancelike meditation, during which you retain consciousness.",
      },
    ],
    description:
      "Creature Type: Humanoid. Size: Medium (about 5\u20136 feet tall). As an Elf, you have these special traits.",
  },
  {
    name: "Gnome",
    speed: 30,
    size: "Small",
    traits: [
      {
        name: "Darkvision",
        description: "You have Darkvision with a range of 60 feet.",
      },
      {
        name: "Gnomish Cunning",
        description:
          "You have Advantage on Intelligence, Wisdom, and Charisma saving throws.",
      },
      {
        name: "Gnomish Lineage",
        description:
          "You are part of a lineage that grants you supernatural abilities. Choose one of the following options; whichever one you choose, Intelligence, Wisdom, or Charisma is your spellcasting ability for the spells you cast with this trait (choose the ability when you select the lineage): Forest Gnome (you know the Minor Illusion cantrip, you also always have the Speak with Animals spell prepared, you can cast it without a spell slot a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Long Rest, you can also use any spell slots you have to cast the spell) or Rock Gnome (you know the Mending and Prestidigitation cantrips, in addition you can spend 10 minutes casting Prestidigitation to create a Tiny clockwork device (AC 5, 1 HP) such as a toy, fire starter, or music box, when you create the device you determine its function by choosing one effect from Prestidigitation and the device produces that effect whenever you or another creature takes a Bonus Action to activate it with a touch, you can have three such devices in existence at a time and each falls apart 8 hours after its creation or when you dismantle it with a touch as a Utilize action).",
      },
    ],
    description:
      "Creature Type: Humanoid. Size: Small (about 3\u20134 feet tall). As a Gnome, you have these special traits.",
  },
  {
    name: "Goliath",
    speed: 35,
    size: "Medium",
    traits: [
      {
        name: "Giant Ancestry",
        description:
          "You are descended from Giants. Choose one of the following benefits\u2014a supernatural boon from your ancestry; you can use the chosen benefit a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Long Rest: Cloud's Jaunt (Cloud Giant) \u2014 As a Bonus Action, you magically teleport up to 30 feet to an unoccupied space you can see. Fire's Burn (Fire Giant) \u2014 When you hit a target with an attack roll and deal damage to it, you can also deal 1d10 Fire damage to that target. Frost's Chill (Frost Giant) \u2014 When you hit a target with an attack roll and deal damage to it, you can also deal 1d6 Cold damage to that target and reduce its Speed by 10 feet until the start of your next turn. Hill's Tumble (Hill Giant) \u2014 When you hit a Large or smaller creature with an attack roll and deal damage to it, you can give that target the Prone condition. Stone's Endurance (Stone Giant) \u2014 When you take damage, you can take a Reaction to roll 1d12. Add your Constitution modifier to the number rolled and reduce the damage by that total. Storm's Thunder (Storm Giant) \u2014 When you take damage from a creature within 60 feet of you, you can take a Reaction to deal 1d8 Thunder damage to that creature.",
      },
      {
        name: "Large Form",
        description:
          "Starting at character level 5, you can change your size to Large as a Bonus Action if you're in a big enough space. This transformation lasts for 10 minutes or until you end it (no action required). For that duration, you have Advantage on Strength checks, and your Speed increases by 10 feet. Once you use this trait, you can't use it again until you finish a Long Rest.",
      },
      {
        name: "Powerful Build",
        description:
          "You have Advantage on any ability check you make to end the Grappled condition. You also count as one size larger when determining your carrying capacity.",
      },
    ],
    description:
      "Creature Type: Humanoid. Size: Medium (about 7\u20138 feet tall). As a Goliath, you have these special traits.",
  },
  {
    name: "Halfling",
    speed: 30,
    size: "Small",
    traits: [
      {
        name: "Brave",
        description:
          "You have Advantage on saving throws you make to avoid or end the Frightened condition.",
      },
      {
        name: "Halfling Nimbleness",
        description:
          "You can move through the space of any creature that is a size larger than you, but you can't stop in the same space.",
      },
      {
        name: "Luck",
        description:
          "When you roll a 1 on the d20 of a D20 Test, you can reroll the die, and you must use the new roll.",
      },
      {
        name: "Naturally Stealthy",
        description:
          "You can take the Hide action even when you are obscured only by a creature that is at least one size larger than you.",
      },
    ],
    description:
      "Creature Type: Humanoid. Size: Small (about 2\u20133 feet tall). As a Halfling, you have these special traits.",
  },
  {
    name: "Human",
    speed: 30,
    size: "Medium or Small",
    traits: [
      {
        name: "Resourceful",
        description:
          "You gain Heroic Inspiration whenever you finish a Long Rest.",
      },
      {
        name: "Skillful",
        description: "You gain proficiency in one skill of your choice.",
      },
      {
        name: "Versatile",
        description:
          'You gain an Origin feat of your choice (see "Feats"). Skilled is recommended.',
      },
    ],
    description:
      "Creature Type: Humanoid. Size: Medium (about 4\u20137 feet tall) or Small (about 2\u20134 feet tall), chosen when you select this species. As a Human, you have these special traits.",
  },
  {
    name: "Orc",
    speed: 30,
    size: "Medium",
    traits: [
      {
        name: "Adrenaline Rush",
        description:
          "You can take the Dash action as a Bonus Action. When you do so, you gain a number of Temporary Hit Points equal to your Proficiency Bonus. You can use this trait a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish a Short or Long Rest.",
      },
      {
        name: "Darkvision",
        description: "You have Darkvision with a range of 120 feet.",
      },
      {
        name: "Relentless Endurance",
        description:
          "When you are reduced to 0 Hit Points but not killed outright, you can drop to 1 Hit Point instead. Once you use this trait, you can't do so again until you finish a Long Rest.",
      },
    ],
    description:
      "Creature Type: Humanoid. Size: Medium (about 6\u20137 feet tall). As an Orc, you have these special traits.",
  },
  {
    name: "Tiefling",
    speed: 30,
    size: "Medium or Small",
    traits: [
      {
        name: "Darkvision",
        description: "You have Darkvision with a range of 60 feet.",
      },
      {
        name: "Fiendish Legacy",
        description:
          "You are the recipient of a legacy that grants you supernatural abilities. Choose a legacy from the Fiendish Legacies table: Abyssal (you have Resistance to Poison damage, you also know the Poison Spray cantrip; Ray of Sickness at level 3; Hold Person at level 5), Chthonic (you have Resistance to Necrotic damage, you also know the Chill Touch cantrip; False Life at level 3; Ray of Enfeeblement at level 5), or Infernal (you have Resistance to Fire damage, you also know the Fire Bolt cantrip; Hellish Rebuke at level 3; Darkness at level 5). You gain the level 1 benefit of the chosen legacy. When you reach character levels 3 and 5, you learn a higher-level spell, as shown on the table. You always have that spell prepared. You can cast it once without a spell slot, and you regain the ability to cast it in that way when you finish a Long Rest. You can also cast the spell using any spell slots you have of the appropriate level. Intelligence, Wisdom, or Charisma is your spellcasting ability for the spells you cast with this trait (choose the ability when you select the legacy).",
      },
      {
        name: "Otherworldly Presence",
        description:
          "You know the Thaumaturgy cantrip. When you cast it with this trait, the spell uses the same spellcasting ability you use for your Fiendish Legacy trait.",
      },
    ],
    description:
      "Creature Type: Humanoid. Size: Medium (about 4\u20137 feet tall) or Small (about 3\u20134 feet tall), chosen when you select this species. As a Tiefling, you have the following special traits.",
  },
];
