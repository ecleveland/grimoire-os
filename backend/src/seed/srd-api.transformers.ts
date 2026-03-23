// ── API response types (partial, only fields we use) ──

export interface ApiSpell {
  name: string;
  level: number;
  school: { name: string };
  casting_time: string;
  range: string;
  components: string[];
  material?: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  desc: string[];
  higher_level?: string[];
  classes: { name: string }[];
}

export interface ApiMonster {
  name: string;
  size: string;
  type: string;
  subtype?: string;
  alignment?: string;
  armor_class: { value: number; type?: string }[];
  hit_points: number;
  hit_dice: string;
  speed: Record<string, string>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  proficiencies: { value: number; proficiency: { name: string } }[];
  damage_resistances: string[];
  damage_immunities: string[];
  damage_vulnerabilities: string[];
  condition_immunities: { name: string }[];
  senses: Record<string, string | number>;
  languages: string;
  challenge_rating: number;
  xp: number;
  special_abilities?: { name: string; desc: string }[];
  actions?: { name: string; desc: string; attack_bonus?: number }[];
  reactions?: { name: string; desc: string }[];
  legendary_actions?: { name: string; desc: string }[];
  desc?: string;
}

export interface ApiEquipment {
  name: string;
  equipment_category: { name: string };
  weapon_category?: string;
  weapon_range?: string;
  category_range?: string;
  cost?: { quantity: number; unit: string };
  weight?: number;
  damage?: { damage_dice: string; damage_type: { name: string } };
  two_handed_damage?: { damage_dice: string; damage_type: { name: string } };
  armor_class?: { base: number; dex_bonus: boolean };
  armor_category?: string;
  str_minimum?: number;
  stealth_disadvantage?: boolean;
  properties?: { name: string }[];
  desc?: string[];
  special?: string[];
}

export interface ApiMagicItem {
  name: string;
  equipment_category: { name: string };
  rarity: { name: string };
  desc: string[];
}

export interface ApiBackground {
  name: string;
  starting_proficiencies: { name: string }[];
  language_options?: { choose: number };
  starting_equipment: { equipment: { name: string }; quantity: number }[];
  starting_equipment_options?: { choose: number; from: unknown }[];
  feature: { name: string; desc: string[] };
  personality_traits: {
    from: { options: { string?: string; option_type: string }[] };
  };
  ideals: { from: { options: { desc?: string; option_type: string }[] } };
  bonds: { from: { options: { string?: string; option_type: string }[] } };
  flaws: { from: { options: { string?: string; option_type: string }[] } };
}

export interface ApiFeat {
  name: string;
  desc: string[];
  prerequisites: {
    ability_score?: { name: string };
    minimum_score?: number;
    type?: string;
  }[];
}

// ── Transformers ──────────────────────────────────────

export function transformSpell(api: ApiSpell) {
  return {
    name: api.name,
    level: api.level,
    school: api.school?.name ?? "Unknown",
    castingTime: api.casting_time,
    range: api.range,
    components: api.components?.join(", ") ?? "",
    material: api.material ?? null,
    duration: api.duration,
    concentration: api.concentration ?? false,
    ritual: api.ritual ?? false,
    description: api.desc?.join("\n\n") ?? "",
    higherLevels: api.higher_level?.length
      ? api.higher_level.join("\n\n")
      : null,
    classes: api.classes?.map((c) => c.name) ?? [],
  };
}

export function transformMonster(api: ApiMonster) {
  const ac = api.armor_class?.[0];
  const savingThrows: Record<string, number> = {};
  const skills: Record<string, number> = {};

  for (const p of api.proficiencies ?? []) {
    const name = p.proficiency?.name ?? "";
    if (name.startsWith("Saving Throw: ")) {
      savingThrows[name.replace("Saving Throw: ", "")] = p.value;
    } else if (name.startsWith("Skill: ")) {
      skills[name.replace("Skill: ", "")] = p.value;
    }
  }

  const speedParts: string[] = [];
  if (api.speed) {
    for (const [type, value] of Object.entries(api.speed)) {
      if (type === "walk") {
        speedParts.unshift(value);
      } else {
        speedParts.push(`${type} ${value}`);
      }
    }
  }

  const senseParts: string[] = [];
  if (api.senses) {
    for (const [key, value] of Object.entries(api.senses)) {
      const label = key.replace(/_/g, " ");
      senseParts.push(`${label} ${value}`);
    }
  }

  return {
    name: api.name,
    size: api.size,
    type: api.type,
    subtype: api.subtype ?? null,
    alignment: api.alignment ?? null,
    armorClass: ac?.value ?? 10,
    armorType: ac?.type ?? null,
    hitPoints: api.hit_points,
    hitDice: api.hit_dice ?? null,
    speed: speedParts.join(", ") || "0 ft.",
    str: api.strength,
    dex: api.dexterity,
    con: api.constitution,
    int: api.intelligence,
    wis: api.wisdom,
    cha: api.charisma,
    savingThrows: Object.keys(savingThrows).length ? savingThrows : null,
    skills: Object.keys(skills).length ? skills : null,
    damageResistances: api.damage_resistances ?? [],
    damageImmunities: api.damage_immunities ?? [],
    damageVulnerabilities: api.damage_vulnerabilities ?? [],
    conditionImmunities: api.condition_immunities?.map((c) => c.name) ?? [],
    senses: senseParts.length ? senseParts.join(", ") : null,
    languages: api.languages || null,
    challengeRating: api.challenge_rating,
    experiencePoints: api.xp ?? null,
    specialAbilities:
      api.special_abilities?.map((a) => ({
        name: a.name,
        description: a.desc,
      })) ?? null,
    actions:
      api.actions?.map((a) => ({ name: a.name, description: a.desc })) ?? null,
    reactions:
      api.reactions?.map((a) => ({ name: a.name, description: a.desc })) ??
      null,
    legendaryActions:
      api.legendary_actions?.map((a) => ({
        name: a.name,
        description: a.desc,
      })) ?? null,
    description: api.desc ?? null,
  };
}

export function transformEquipment(api: ApiEquipment) {
  const cost = api.cost ? `${api.cost.quantity} ${api.cost.unit}` : null;
  const category =
    api.category_range ??
    api.armor_category ??
    api.equipment_category?.name ??
    "Adventuring Gear";
  const desc =
    [...(api.desc ?? []), ...(api.special ?? [])].join("\n\n") || null;

  return {
    name: api.name,
    category,
    cost,
    weight: api.weight ?? null,
    description: desc,
    damage: api.damage
      ? `${api.damage.damage_dice} ${api.damage.damage_type.name}`.toLowerCase()
      : null,
    damageType: api.damage?.damage_type?.name ?? null,
    armorClass: api.armor_class?.base ?? null,
    stealthDisadvantage: api.stealth_disadvantage ?? false,
    strengthRequirement: api.str_minimum ?? null,
    properties: api.properties?.map((p) => p.name) ?? [],
    rarity: null,
    requiresAttunement: false,
    isMagic: false,
  };
}

export function transformBackground(api: ApiBackground) {
  const skillProficiencies =
    api.starting_proficiencies
      ?.filter((p) => p.name.startsWith("Skill: "))
      .map((p) => p.name.replace("Skill: ", "")) ?? [];
  const toolProficiencies =
    api.starting_proficiencies
      ?.filter((p) => !p.name.startsWith("Skill: "))
      .map((p) => p.name) ?? [];

  const equipmentParts =
    api.starting_equipment?.map(
      (e) => `${e.quantity > 1 ? e.quantity + " " : ""}${e.equipment.name}`,
    ) ?? [];

  const extractStrings = (opts: { string?: string; option_type: string }[]) =>
    opts?.filter((o) => o.string).map((o) => o.string!) ?? [];

  const extractDescs = (opts: { desc?: string; option_type: string }[]) =>
    opts?.filter((o) => o.desc).map((o) => o.desc!) ?? [];

  return {
    name: api.name,
    description: api.feature?.desc?.join("\n\n") ?? null,
    skillProficiencies,
    toolProficiencies,
    languages: api.language_options?.choose ?? 0,
    equipment: equipmentParts.join(", ") || null,
    feature: api.feature
      ? {
          name: api.feature.name,
          description: api.feature.desc?.join("\n\n") ?? "",
        }
      : null,
    personalityTraits: extractStrings(
      api.personality_traits?.from?.options ?? [],
    ),
    ideals: extractDescs(api.ideals?.from?.options ?? []),
    bonds: extractStrings(api.bonds?.from?.options ?? []),
    flaws: extractStrings(api.flaws?.from?.options ?? []),
  };
}

export function transformFeat(api: ApiFeat) {
  const prereqs = api.prerequisites
    ?.map((p) => {
      if (p.ability_score && p.minimum_score) {
        return `${p.ability_score.name} ${p.minimum_score} or higher`;
      }
      return p.type ?? null;
    })
    .filter(Boolean);

  return {
    name: api.name,
    description: api.desc?.join("\n\n") ?? "",
    prerequisite: prereqs?.length ? prereqs.join(", ") : null,
    benefits: api.desc?.slice(1) ?? [],
  };
}

export function transformMagicItem(api: ApiMagicItem) {
  const description = api.desc?.join("\n\n") ?? "";
  const requiresAttunement = /requires attunement/i.test(description);

  return {
    name: api.name,
    category: api.equipment_category?.name ?? "Wondrous Items",
    cost: null,
    weight: null,
    description,
    damage: null,
    damageType: null,
    armorClass: null,
    stealthDisadvantage: false,
    strengthRequirement: null,
    properties: [],
    rarity: api.rarity?.name ?? null,
    requiresAttunement,
    isMagic: true,
  };
}
