// Setting/region → race-bias map used by the NPC generator's race-pick step.
// Keys are case-insensitive lookup terms (lowercased here); values are race
// weights that the generator combines with the base species distribution.
//
// v1 ships a small fixed mapping. Per-campaign DM-defined biases are deferred
// (see VEG-251 / design doc → Region/Setting Bias).

export type NpcSettingBias = Record<string, Record<string, number>>;

export const npcSettingBiases: NpcSettingBias = {
  'dwarven mine': {
    Dwarf: 70,
    Human: 15,
    Gnome: 10,
    Halfling: 5,
  },
  'nine hells': {
    Tiefling: 60,
    Human: 20,
    Dragonborn: 10,
    Orc: 10,
  },
  'elven forest': {
    Elf: 70,
    Halfling: 10,
    Human: 10,
    Gnome: 10,
  },
  'coastal city': {
    Human: 40,
    Halfling: 15,
    Dwarf: 10,
    Elf: 10,
    Gnome: 10,
    Dragonborn: 5,
    Orc: 5,
    Tiefling: 5,
  },
  'desert oasis': {
    Human: 45,
    Goliath: 20,
    Dragonborn: 15,
    Halfling: 10,
    Tiefling: 10,
  },
  'mountain hold': {
    Dwarf: 55,
    Goliath: 25,
    Human: 10,
    Orc: 10,
  },
  'underdark settlement': {
    Elf: 30,
    Dwarf: 25,
    Gnome: 20,
    Tiefling: 15,
    Orc: 10,
  },
  'frontier village': {
    Human: 45,
    Halfling: 20,
    Dwarf: 10,
    Elf: 10,
    Orc: 10,
    Gnome: 5,
  },
};
