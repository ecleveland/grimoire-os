import * as fs from 'fs';
import * as path from 'path';

const JSON_DIR = path.resolve(__dirname, '../../../docs/extracted-srd-json');

function readJsonFile<T>(filename: string): T {
  const filePath = path.join(JSON_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`SRD JSON not found: ${filePath}. Ensure docs/extracted-srd-json/ exists.`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

// ── JSON type definitions ──────────────────────────────

interface JsonSpell {
  name: string;
  level: number;
  school: string;
  classes: string[];
  casting_time: string;
  ritual: boolean;
  range: string;
  components: {
    verbal: boolean;
    somatic: boolean;
    material: boolean;
    material_description: string | null;
  };
  duration: string;
  concentration: boolean;
  description: string;
  higher_levels: string | null;
  cantrip_upgrade: string | null;
}

interface JsonMonster {
  name: string;
  size: string;
  type: string;
  alignment: string | null;
  armor_class: number;
  armor_description: string | null;
  hit_points: { average: number; formula: string };
  speed: Record<string, number | boolean | null>;
  ability_scores: Record<string, { score: number; modifier: number; save: number }>;
  skills: Record<string, string> | null;
  damage_resistances: string[] | null;
  damage_immunities: string[] | null;
  damage_vulnerabilities: string[] | null;
  condition_immunities: string[] | null;
  senses: string | null;
  languages: string | null;
  challenge_rating: string;
  xp: number;
  proficiency_bonus: number;
  traits: { name: string; description: string }[] | null;
  actions: { name: string; description: string }[] | null;
  reactions: { name: string; description: string }[] | null;
  legendary_actions: {
    description: string;
    actions: { name: string; description: string }[];
  } | null;
}

interface JsonMagicItem {
  name: string;
  category: string;
  subcategory: string | null;
  rarity: string;
  requires_attunement: boolean;
  description: string;
}

interface JsonSpecies {
  name: string;
  creature_type: string;
  size: string;
  size_description: string;
  speed: number;
  traits: { name: string; description: string }[];
}

// ── Loaders ────────────────────────────────────────────

export function loadSpellsFromJson() {
  const data = readJsonFile<{ spells: JsonSpell[] }>('spells.json');
  return data.spells.map(s => {
    const parts: string[] = [];
    if (s.components.verbal) parts.push('V');
    if (s.components.somatic) parts.push('S');
    if (s.components.material) parts.push('M');

    let description = s.description;
    if (s.cantrip_upgrade) {
      description += '\n\n' + s.cantrip_upgrade;
    }

    return {
      name: s.name,
      level: s.level,
      school: s.school,
      castingTime: s.casting_time,
      range: s.range,
      components: parts.join(', '),
      material: s.components.material_description ?? null,
      duration: s.duration,
      concentration: s.concentration,
      ritual: s.ritual,
      description,
      higherLevels: s.higher_levels ?? null,
      classes: s.classes,
    };
  });
}

const ABILITY_ABBREV: Record<string, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

const CR_FRACTIONS: Record<string, number> = {
  '1/8': 0.125,
  '1/4': 0.25,
  '1/2': 0.5,
};

function parseChallengeRating(cr: string): number {
  return CR_FRACTIONS[cr] ?? parseFloat(cr);
}

function formatSpeed(speed: Record<string, number | boolean | null>): string {
  const parts: string[] = [];
  const walk = speed.walk;
  if (typeof walk === 'number' && walk > 0) {
    parts.push(`${walk} ft.`);
  }
  for (const [key, val] of Object.entries(speed)) {
    if (key === 'walk' || key === 'hover') continue;
    if (typeof val === 'number' && val > 0) {
      parts.push(`${key} ${val} ft.`);
    }
  }
  if (speed.hover === true) {
    parts.push('hover');
  }
  return parts.join(', ');
}

export function loadMonstersFromJson() {
  const data = readJsonFile<{ monsters: JsonMonster[] }>('monsters.json');
  return data.monsters.map(m => {
    // Derive saving throw proficiencies
    const savingThrows: Record<string, number> = {};
    for (const [ability, scores] of Object.entries(m.ability_scores)) {
      if (scores.save !== scores.modifier) {
        savingThrows[ABILITY_ABBREV[ability]] = scores.save;
      }
    }

    // Parse skills
    let skills: Record<string, number> | null = null;
    if (m.skills) {
      skills = {};
      for (const [name, val] of Object.entries(m.skills)) {
        skills[name] = parseInt(val, 10);
      }
    }

    // Strip extra fields from trait-like arrays, keeping only name+description
    const strip = (arr: { name: string; description: string }[] | null) =>
      arr ? arr.map(({ name, description }) => ({ name, description })) : null;

    return {
      name: m.name,
      size: m.size,
      type: m.type,
      subtype: null as string | null,
      alignment: m.alignment ?? null,
      armorClass: m.armor_class,
      armorType: m.armor_description ?? null,
      hitPoints: m.hit_points.average,
      hitDice: m.hit_points.formula,
      speed: formatSpeed(m.speed),
      str: m.ability_scores.strength.score,
      dex: m.ability_scores.dexterity.score,
      con: m.ability_scores.constitution.score,
      int: m.ability_scores.intelligence.score,
      wis: m.ability_scores.wisdom.score,
      cha: m.ability_scores.charisma.score,
      savingThrows: Object.keys(savingThrows).length > 0 ? savingThrows : null,
      skills,
      damageResistances: m.damage_resistances ?? [],
      damageImmunities: m.damage_immunities ?? [],
      damageVulnerabilities: m.damage_vulnerabilities ?? [],
      conditionImmunities: m.condition_immunities ?? [],
      senses: m.senses ?? null,
      languages: m.languages ?? null,
      challengeRating: parseChallengeRating(m.challenge_rating),
      experiencePoints: m.xp,
      specialAbilities: strip(m.traits),
      actions: strip(m.actions),
      reactions: strip(m.reactions),
      legendaryActions: m.legendary_actions ? strip(m.legendary_actions.actions) : null,
      description: null as string | null,
    };
  });
}

export function loadMagicItemsFromJson() {
  const data = readJsonFile<{ magic_items: JsonMagicItem[] }>('magic_items.json');
  return data.magic_items.map(item => ({
    name: item.name,
    category: item.category,
    description: item.description,
    rarity: item.rarity,
    requiresAttunement: item.requires_attunement,
    isMagic: true,
    properties: item.subcategory ? [item.subcategory] : [],
  }));
}

export function loadSpeciesAsRacesFromJson() {
  const data = readJsonFile<{ species: JsonSpecies[] }>('species.json');
  return data.species.map(s => ({
    name: s.name,
    speed: s.speed,
    size: s.size,
    traits: s.traits.map(({ name, description }) => ({ name, description })),
    languages: ['Common'],
    sizeDescription: s.size_description,
  }));
}
