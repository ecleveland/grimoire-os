// Pure NPC generation pipeline. No Prisma, no I/O — takes pre-loaded reference
// data + constraints + a seeded RNG and returns a GeneratedNpc. The Nest
// service orchestrates the data loading and persistence around it.

import {
  GeneratedAppearance,
  GeneratedLoot,
  GeneratedLootItem,
  GeneratedName,
  GeneratedNpc,
  GeneratedPersonality,
  NpcAppearanceCategory,
  NpcGenerationConstraints,
  NpcGenerationDecisions,
  NpcGenerationParams,
  NpcLootOverrides,
  NpcStatBlock,
  RerollField,
  StatBlockAction,
} from './npc-generator.types';
import { SeededRng } from './seeded-rng';
import {
  AGE_RANGE_BY_RACE,
  DEFAULT_AGE_RANGE,
  DEFAULT_CR_BUCKET_WEIGHTS,
  GENERIC_PROFESSIONS,
  HOSTILITY_ALIGNMENT_BIAS,
  NAME_GENDERS,
  NPC_ALIGNMENT_ORDER,
  NPC_LOOT_GENERIC_PROFESSION,
  PROFESSIONS_BY_BACKGROUND,
  PROFESSION_WEAPON,
  STATBLOCK_CIVILIAN_BASE,
  STATBLOCK_COMBATANT_POOLS_BY_BUCKET,
  STATBLOCK_WEAPON_ACTION_KEYWORDS,
} from './npc-generator.constants';
import { NPC_APPEARANCE_CATEGORIES } from '../../seed/data/npc-appearance-traits';

export type SpeciesRef = { name: string; size: string | null };

export type BackgroundRef = {
  name: string;
  personalityTraits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
};

export type AlignmentPriorRef = {
  race: string;
  background: string | null;
  weights: number[];
};

export type NamePoolRef = {
  race: string;
  gender: string | null;
  kind: 'first' | 'family' | 'epithet';
  value: string;
};

export type AppearanceTraitRef = {
  race: string;
  category: NpcAppearanceCategory;
  trait: string;
};

export type LootTemplateItemRef = { itemName: string; weight: number; qty: [number, number] };

export type LootTemplateRef = {
  profession: string;
  crBucket: string;
  coinage: { gp: [number, number]; sp: [number, number]; cp: [number, number] };
  items: LootTemplateItemRef[];
};

export type TrinketRef = { description: string };

export type ItemRef = { id: string; name: string; isMagic: boolean };

export type MonsterRef = {
  name: string;
  size: string;
  type: string;
  subtype: string | null;
  alignment: string | null;
  armorClass: number;
  armorType: string | null;
  hitPoints: number;
  hitDice: string | null;
  speed: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  savingThrows: Record<string, number> | null;
  skills: Record<string, number> | null;
  damageResistances: string[];
  damageImmunities: string[];
  damageVulnerabilities: string[];
  conditionImmunities: string[];
  senses: string | null;
  languages: string | null;
  challengeRating: number;
  experiencePoints: number | null;
  specialAbilities: StatBlockAction[] | null;
  actions: StatBlockAction[];
  reactions: StatBlockAction[] | null;
  legendaryActions: StatBlockAction[] | null;
};

export type GameRulesRef = {
  trinketChance: number;
  magicItemChanceByCr: Record<string, number>;
  itemCountDie: string;
  coinageMultiplier: number;
};

export type CustomPersonalityRef = {
  background: string;
  kind: 'personalityTraits' | 'ideals' | 'bonds' | 'flaws';
  value: string;
};

export type NpcRefData = {
  species: SpeciesRef[];
  backgrounds: BackgroundRef[];
  alignmentPriors: AlignmentPriorRef[];
  namePools: NamePoolRef[];
  appearanceTraits: AppearanceTraitRef[];
  lootTemplates: LootTemplateRef[];
  trinkets: TrinketRef[];
  customPersonality: CustomPersonalityRef[];
  itemsByName: Map<string, ItemRef>;
  magicItems: ItemRef[];
  monsters: MonsterRef[];
  settingBiases: Record<string, Record<string, number>>;
  gameRules: GameRulesRef;
};

const PIPELINE_VERSION = 1;

const SAMPLE_COUNTS: Record<keyof GeneratedPersonality, number> = {
  traits: 1,
  ideals: 1,
  bonds: 1,
  flaws: 1,
};

export class NpcPipeline {
  constructor(private readonly data: NpcRefData) {}

  /** Run every step in order; returns a GeneratedNpc payload. */
  generate(constraints: NpcGenerationConstraints, seed: string): GeneratedNpc {
    const decisions: NpcGenerationDecisions = {};
    decisions.race = this.pickRace(this.subRng(seed, 'race'), constraints, decisions);
    decisions.background = this.pickBackground(this.subRng(seed, 'background'), constraints);
    decisions.profession = this.pickProfession(
      this.subRng(seed, 'profession'),
      constraints,
      decisions
    );
    decisions.alignment = this.pickAlignment(
      this.subRng(seed, 'alignment'),
      constraints,
      decisions
    );
    decisions.name = this.pickName(this.subRng(seed, 'name'), constraints, decisions);
    decisions.appearance = this.pickAppearance(
      this.subRng(seed, 'appearance'),
      constraints,
      decisions
    );
    decisions.personality = this.pickPersonality(
      this.subRng(seed, 'personality'),
      constraints,
      decisions
    );
    decisions.loot = this.pickLoot(this.subRng(seed, 'loot'), constraints, decisions);
    decisions.statBlock = this.pickStatBlock(
      this.subRng(seed, 'statBlock'),
      constraints,
      decisions
    );
    return this.assemble(seed, constraints, decisions);
  }

  /**
   * Re-run a single step (or all steps minus locked fields) on top of an
   * existing GenerationParams. Returns a fresh GeneratedNpc payload — caller
   * persists it. The new sub-seed used for each rerolled step is generated
   * fresh so the result actually differs from the prior decision.
   */
  reroll(
    field: RerollField,
    params: NpcGenerationParams,
    lockedFields: readonly string[]
  ): GeneratedNpc {
    if (field === 'all') {
      const newSeed = SeededRng.generateSeed();
      const baseDecisions: NpcGenerationDecisions = {};
      const orderedSteps: Exclude<RerollField, 'all' | 'statBlock'>[] = [
        'race',
        'background',
        'profession',
        'alignment',
        'name',
        'appearance',
        'personality',
        'loot',
      ];
      for (const step of orderedSteps) {
        if (lockedFields.includes(step)) {
          // Carry the prior decision forward unchanged.
          this.copyDecision(step, params.decisions, baseDecisions);
        } else {
          this.runSingleStep(step, this.subRng(newSeed, step), params.constraints, baseDecisions);
        }
      }
      // Stat block follows the combatRelevant constraint and overrides from the
      // (possibly rerolled) name/alignment decisions. Always rerolled on a
      // reroll-all: lockedFields gates whole-field protection, not the
      // generation step itself.
      baseDecisions.statBlock = this.pickStatBlock(
        this.subRng(newSeed, 'statBlock'),
        params.constraints,
        baseDecisions
      );
      return this.assemble(newSeed, params.constraints, baseDecisions);
    }

    if (lockedFields.includes(field)) {
      // Locked single-field reroll is a no-op replay.
      return this.assemble(params.seed, params.constraints, params.decisions);
    }

    // Single-field reroll: keep the persisted seed for the unchanged steps,
    // mint a fresh per-field seed so the rerolled value differs.
    const newDecisions: NpcGenerationDecisions = { ...params.decisions };
    const stepSeed = `${params.seed}::reroll::${field}::${SeededRng.generateSeed()}`;
    // Promoting a Lite NPC to Full: when the user explicitly rerolls statBlock
    // we force combatRelevant=true for that single step so a meaningful stat
    // block is produced. The persisted constraints themselves are not mutated.
    const stepConstraints =
      field === 'statBlock' ? { ...params.constraints, combatRelevant: true } : params.constraints;
    this.runSingleStep(field, new SeededRng(stepSeed), stepConstraints, newDecisions);
    return this.assemble(params.seed, params.constraints, newDecisions);
  }

  // ── Step 1 ────────────────────────────────────────────────────────────────
  pickRace(
    rng: SeededRng,
    constraints: NpcGenerationConstraints,
    _decisions: NpcGenerationDecisions
  ): string {
    if (constraints.race) return constraints.race;
    const settingKey = constraints.setting?.toLowerCase().trim();
    const bias = settingKey ? this.data.settingBiases[settingKey] : null;
    const allRaces = this.data.species.map(s => s.name);
    if (allRaces.length === 0) throw new Error('No species available for NPC generation');
    if (bias) {
      const entries = allRaces.map(race => ({ value: race, weight: bias[race] ?? 0 }));
      const anyPositive = entries.some(e => e.weight > 0);
      if (anyPositive) return rng.weightedPick(entries);
    }
    return rng.pickOne(allRaces);
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────
  pickBackground(rng: SeededRng, constraints: NpcGenerationConstraints): string | null {
    if (constraints.background) return constraints.background;
    if (this.data.backgrounds.length === 0) return null;
    return rng.pickOne(this.data.backgrounds.map(b => b.name));
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────
  pickProfession(
    rng: SeededRng,
    constraints: NpcGenerationConstraints,
    decisions: NpcGenerationDecisions
  ): string {
    if (constraints.profession) return constraints.profession;
    const bg = decisions.background ?? null;
    const curated = bg ? (PROFESSIONS_BY_BACKGROUND[bg] ?? []) : [];
    const pool = Array.from(new Set([...curated, ...GENERIC_PROFESSIONS]));
    return rng.pickOne(pool);
  }

  // ── Step 4 ────────────────────────────────────────────────────────────────
  pickAlignment(
    rng: SeededRng,
    constraints: NpcGenerationConstraints,
    decisions: NpcGenerationDecisions
  ): string {
    if (constraints.alignment) return constraints.alignment;
    const race = decisions.race;
    if (!race) throw new Error('pickAlignment requires race decision');
    const bg = decisions.background ?? null;
    let weights = this.lookupAlignmentWeights(race, bg);
    if (constraints.hostility) {
      const bias = HOSTILITY_ALIGNMENT_BIAS[constraints.hostility];
      weights = weights.map((w, i) => w * bias[i]);
    }
    const entries = NPC_ALIGNMENT_ORDER.map((name, i) => ({ value: name, weight: weights[i] }));
    if (entries.every(e => e.weight <= 0)) {
      return rng.pickOne(NPC_ALIGNMENT_ORDER);
    }
    return rng.weightedPick(entries);
  }

  private lookupAlignmentWeights(race: string, background: string | null): number[] {
    const exact = this.data.alignmentPriors.find(
      p => p.race === race && p.background === background
    );
    if (exact) return exact.weights.slice();
    const raceDefault = this.data.alignmentPriors.find(
      p => p.race === race && p.background === null
    );
    if (raceDefault) return raceDefault.weights.slice();
    return NPC_ALIGNMENT_ORDER.map(() => 1);
  }

  // ── Step 5 ────────────────────────────────────────────────────────────────
  pickName(
    rng: SeededRng,
    constraints: NpcGenerationConstraints,
    decisions: NpcGenerationDecisions
  ): GeneratedName {
    const race = decisions.race;
    if (!race) throw new Error('pickName requires race decision');
    const gender =
      constraints.gender ?? (rng.pickOne(NAME_GENDERS) as (typeof NAME_GENDERS)[number]);
    if (constraints.name) {
      // Constraint name supplied: keep as-is, infer first/family from whitespace split.
      const parts = constraints.name.split(/\s+/);
      const first = parts[0] ?? constraints.name;
      const family = parts.length > 1 ? parts.slice(1).join(' ') : null;
      return { full: constraints.name, first, family, gender };
    }
    const firsts = this.data.namePools.filter(
      p => p.race === race && p.kind === 'first' && (p.gender === gender || p.gender === null)
    );
    const families = this.data.namePools.filter(p => p.race === race && p.kind === 'family');
    const first = firsts.length > 0 ? rng.pickOne(firsts).value : `Unnamed ${race}`;
    const family = families.length > 0 ? rng.pickOne(families).value : null;
    return {
      full: family ? `${first} ${family}` : first,
      first,
      family,
      gender,
    };
  }

  // ── Step 6 ────────────────────────────────────────────────────────────────
  pickAppearance(
    rng: SeededRng,
    _constraints: NpcGenerationConstraints,
    decisions: NpcGenerationDecisions
  ): GeneratedAppearance {
    const race = decisions.race;
    if (!race) throw new Error('pickAppearance requires race decision');
    const parts: Partial<Record<NpcAppearanceCategory, string>> = {};
    for (const category of NPC_APPEARANCE_CATEGORIES) {
      const pool = this.data.appearanceTraits.filter(
        t => t.race === race && t.category === category
      );
      if (pool.length === 0) continue;
      parts[category] = rng.pickOne(pool).trait;
    }
    const prose = this.composeAppearanceProse(race, parts);
    return { prose, parts };
  }

  private composeAppearanceProse(
    race: string,
    parts: Partial<Record<NpcAppearanceCategory, string>>
  ): string {
    const segments: string[] = [`A ${race.toLowerCase()}`];
    if (parts.build) segments[0] += ` who is ${parts.build}`;
    segments[0] += '.';
    if (parts.hair) segments.push(`They have ${parts.hair}.`);
    if (parts.eyes) segments.push(`Their eyes are ${parts.eyes}.`);
    if (parts.skin) segments.push(`Their skin is ${parts.skin}.`);
    if (parts['distinguishing-mark']) segments.push(`They bear ${parts['distinguishing-mark']}.`);
    return segments.join(' ');
  }

  // ── Step 7 ────────────────────────────────────────────────────────────────
  pickPersonality(
    rng: SeededRng,
    _constraints: NpcGenerationConstraints,
    decisions: NpcGenerationDecisions
  ): GeneratedPersonality {
    const bg = decisions.background;
    const empty: GeneratedPersonality = { traits: [], ideals: [], bonds: [], flaws: [] };
    if (!bg) return empty;
    const ref = this.data.backgrounds.find(b => b.name === bg);
    if (!ref) return empty;
    const customForBg = this.data.customPersonality.filter(c => c.background === bg);
    const customByKind = (kind: CustomPersonalityRef['kind']) =>
      customForBg.filter(c => c.kind === kind).map(c => c.value);
    return {
      traits: rng.sampleDistinct(
        [...ref.personalityTraits, ...customByKind('personalityTraits')],
        SAMPLE_COUNTS.traits
      ),
      ideals: rng.sampleDistinct([...ref.ideals, ...customByKind('ideals')], SAMPLE_COUNTS.ideals),
      bonds: rng.sampleDistinct([...ref.bonds, ...customByKind('bonds')], SAMPLE_COUNTS.bonds),
      flaws: rng.sampleDistinct([...ref.flaws, ...customByKind('flaws')], SAMPLE_COUNTS.flaws),
    };
  }

  // ── Step 8 ────────────────────────────────────────────────────────────────
  pickLoot(
    rng: SeededRng,
    constraints: NpcGenerationConstraints,
    decisions: NpcGenerationDecisions
  ): GeneratedLoot {
    const profession = decisions.profession ?? null;
    const overrides = constraints.lootOverrides ?? {};
    const crBucket = this.pickCrBucket(rng);
    const template = this.findLootTemplate(profession, crBucket);
    const effectiveDie = overrides.itemCountDie ?? this.data.gameRules.itemCountDie;
    const coinageMultiplier = overrides.coinageMultiplier ?? this.data.gameRules.coinageMultiplier;
    const trinketChance = overrides.trinketChance ?? this.data.gameRules.trinketChance;
    const magicItemChance =
      overrides.magicItemChance ?? this.data.gameRules.magicItemChanceByCr[crBucket] ?? 0;

    const coinage = template
      ? {
          gp: Math.round(
            rng.intInRange(template.coinage.gp[0], template.coinage.gp[1]) * coinageMultiplier
          ),
          sp: Math.round(
            rng.intInRange(template.coinage.sp[0], template.coinage.sp[1]) * coinageMultiplier
          ),
          cp: Math.round(
            rng.intInRange(template.coinage.cp[0], template.coinage.cp[1]) * coinageMultiplier
          ),
        }
      : { gp: 0, sp: 0, cp: 0 };

    const items: GeneratedLootItem[] = [];
    if (template && template.items.length > 0) {
      const itemCount = Math.max(0, rng.rollDie(effectiveDie));
      for (let i = 0; i < itemCount; i++) {
        const pick = rng.weightedPick(template.items.map(it => ({ value: it, weight: it.weight })));
        const qty = rng.intInRange(pick.qty[0], pick.qty[1]);
        const ref = this.data.itemsByName.get(pick.itemName);
        items.push({
          itemId: ref?.id ?? null,
          name: pick.itemName,
          quantity: qty,
          source: 'profession',
        });
      }
    }

    if (rng.chance(trinketChance) && this.data.trinkets.length > 0) {
      const trinket = rng.pickOne(this.data.trinkets);
      items.push({
        itemId: null,
        name: trinket.description,
        quantity: 1,
        source: 'trinket',
      });
    }

    if (rng.chance(magicItemChance) && this.data.magicItems.length > 0) {
      const mag = rng.pickOne(this.data.magicItems);
      items.push({ itemId: mag.id, name: mag.name, quantity: 1, source: 'magic-item' });
    }

    return {
      template: template ? { profession: template.profession, crBucket: template.crBucket } : null,
      coinage,
      items,
      effective: {
        itemCountDie: effectiveDie,
        coinageMultiplier,
        trinketChance,
        magicItemChance,
      },
    };
  }

  private pickCrBucket(rng: SeededRng): string {
    return rng.weightedPick(
      DEFAULT_CR_BUCKET_WEIGHTS.map(b => ({ value: b.bucket, weight: b.weight }))
    );
  }

  private findLootTemplate(profession: string | null, crBucket: string): LootTemplateRef | null {
    const find = (prof: string, bucket: string) =>
      this.data.lootTemplates.find(t => t.profession === prof && t.crBucket === bucket);
    if (profession) {
      const exact = find(profession, crBucket);
      if (exact) return exact;
      // Fall back to any CR bucket for this profession.
      const anyBucket = this.data.lootTemplates.find(t => t.profession === profession);
      if (anyBucket) return anyBucket;
    }
    const generic = find(NPC_LOOT_GENERIC_PROFESSION, crBucket);
    if (generic) return generic;
    return this.data.lootTemplates.find(t => t.profession === NPC_LOOT_GENERIC_PROFESSION) ?? null;
  }

  // ── Step 9 ────────────────────────────────────────────────────────────────
  pickStatBlock(
    rng: SeededRng,
    constraints: NpcGenerationConstraints,
    decisions: NpcGenerationDecisions
  ): NpcStatBlock | null {
    if (!constraints.combatRelevant) return null;
    if (this.data.monsters.length === 0) return null;

    const base = this.pickBaseMonster(rng, constraints);
    if (!base) return null;

    const npcName = decisions.name?.full ?? `Unnamed ${decisions.race ?? 'humanoid'}`;
    const npcAlignment = decisions.alignment ?? base.alignment ?? 'Neutral';
    const profession = decisions.profession ?? constraints.profession ?? null;

    const swap = this.swapProfessionWeapon(base.actions, profession);

    return {
      baseMonster: base.name,
      name: npcName,
      size: base.size,
      type: base.type,
      subtype: base.subtype,
      alignment: npcAlignment,
      armorClass: base.armorClass,
      armorType: base.armorType,
      hitPoints: base.hitPoints,
      hitDice: base.hitDice,
      speed: base.speed,
      str: base.str,
      dex: base.dex,
      con: base.con,
      int: base.int,
      wis: base.wis,
      cha: base.cha,
      savingThrows: base.savingThrows,
      skills: base.skills,
      damageResistances: base.damageResistances,
      damageImmunities: base.damageImmunities,
      damageVulnerabilities: base.damageVulnerabilities,
      conditionImmunities: base.conditionImmunities,
      senses: base.senses,
      languages: base.languages,
      challengeRating: base.challengeRating,
      experiencePoints: base.experiencePoints,
      specialAbilities: base.specialAbilities,
      actions: swap.actions,
      reactions: base.reactions,
      legendaryActions: base.legendaryActions,
      professionWeaponSwap: swap.swap,
    };
  }

  private pickBaseMonster(
    rng: SeededRng,
    constraints: NpcGenerationConstraints
  ): MonsterRef | null {
    const bucket = this.pickStatBlockCrBucket(rng);
    const buckets = this.crBucketsToTry(bucket);
    const wantedNames = new Set<string>([STATBLOCK_CIVILIAN_BASE]);
    for (const b of buckets) {
      for (const name of STATBLOCK_COMBATANT_POOLS_BY_BUCKET[b] ?? []) wantedNames.add(name);
    }
    const eligible = this.data.monsters.filter(m => wantedNames.has(m.name));
    if (eligible.length === 0) {
      // Fall back to anything in the bucket(s) by CR if curated names are absent.
      const byCr = this.data.monsters.filter(m =>
        buckets.some(b => this.crFitsBucket(m.challengeRating, b))
      );
      if (byCr.length === 0) return rng.pickOne(this.data.monsters);
      return rng.pickOne(byCr);
    }
    return rng.pickOne(eligible);
  }

  private pickStatBlockCrBucket(rng: SeededRng): string {
    return rng.weightedPick(
      DEFAULT_CR_BUCKET_WEIGHTS.map(b => ({ value: b.bucket, weight: b.weight }))
    );
  }

  private crBucketsToTry(start: string): string[] {
    const order = ['0', '0–1', '2–4', '5–10', '11+'];
    const idx = order.indexOf(start);
    if (idx < 0) return order.slice();
    return [order[idx], ...order.filter((_, i) => i !== idx)];
  }

  private crFitsBucket(cr: number, bucket: string): boolean {
    switch (bucket) {
      case '0':
        return cr === 0;
      case '0–1':
        return cr > 0 && cr <= 1;
      case '2–4':
        return cr >= 2 && cr <= 4;
      case '5–10':
        return cr >= 5 && cr <= 10;
      case '11+':
        return cr >= 11;
      default:
        return false;
    }
  }

  private swapProfessionWeapon(
    actions: StatBlockAction[],
    profession: string | null
  ): { actions: StatBlockAction[]; swap: NpcStatBlock['professionWeaponSwap'] } {
    const weapon = profession ? PROFESSION_WEAPON[profession] : undefined;
    if (!profession || !weapon) {
      return { actions: actions.slice(), swap: null };
    }
    const idx = actions.findIndex(a => isWeaponAction(a.name));
    if (idx < 0) {
      return { actions: actions.slice(), swap: null };
    }
    const original = actions[idx];
    const replaced: StatBlockAction = {
      name: capitalizeWords(weapon),
      description: rewriteWeaponDescription(original.description, weapon),
    };
    const nextActions = actions.slice();
    nextActions[idx] = replaced;
    return {
      actions: nextActions,
      swap: {
        profession,
        weapon,
        replacedAction: original.name,
      },
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private subRng(seed: string, step: string): SeededRng {
    return new SeededRng(`${seed}::${step}`);
  }

  private runSingleStep(
    field: Exclude<RerollField, 'all'>,
    rng: SeededRng,
    constraints: NpcGenerationConstraints,
    decisions: NpcGenerationDecisions
  ): void {
    switch (field) {
      case 'race':
        decisions.race = this.pickRace(rng, constraints, decisions);
        break;
      case 'background':
        decisions.background = this.pickBackground(rng, constraints);
        break;
      case 'profession':
        decisions.profession = this.pickProfession(rng, constraints, decisions);
        break;
      case 'alignment':
        decisions.alignment = this.pickAlignment(rng, constraints, decisions);
        break;
      case 'name':
        decisions.name = this.pickName(rng, constraints, decisions);
        break;
      case 'appearance':
        decisions.appearance = this.pickAppearance(rng, constraints, decisions);
        break;
      case 'personality':
        decisions.personality = this.pickPersonality(rng, constraints, decisions);
        break;
      case 'loot':
        decisions.loot = this.pickLoot(rng, constraints, decisions);
        break;
      case 'statBlock':
        decisions.statBlock = this.pickStatBlock(rng, constraints, decisions);
        break;
    }
  }

  private copyDecision(
    field: Exclude<RerollField, 'all'>,
    from: NpcGenerationDecisions,
    to: NpcGenerationDecisions
  ): void {
    switch (field) {
      case 'race':
        to.race = from.race;
        break;
      case 'background':
        to.background = from.background;
        break;
      case 'profession':
        to.profession = from.profession;
        break;
      case 'alignment':
        to.alignment = from.alignment;
        break;
      case 'name':
        to.name = from.name;
        break;
      case 'appearance':
        to.appearance = from.appearance;
        break;
      case 'personality':
        to.personality = from.personality;
        break;
      case 'loot':
        to.loot = from.loot;
        break;
      case 'statBlock':
        to.statBlock = from.statBlock;
        break;
    }
  }

  private rollAge(rng: SeededRng, race: string): number {
    const range = AGE_RANGE_BY_RACE[race] ?? DEFAULT_AGE_RANGE;
    return rng.intInRange(range[0], range[1]);
  }

  private resolveSize(race: string): string | null {
    return this.data.species.find(s => s.name === race)?.size ?? null;
  }

  private assemble(
    seed: string,
    constraints: NpcGenerationConstraints,
    decisions: NpcGenerationDecisions
  ): GeneratedNpc {
    const race = decisions.race ?? constraints.race ?? 'Human';
    const ageRng = this.subRng(seed, 'age');
    const params: NpcGenerationParams = {
      version: PIPELINE_VERSION,
      seed,
      constraints,
      decisions,
    };
    const personality = decisions.personality ?? { traits: [], ideals: [], bonds: [], flaws: [] };
    const loot = decisions.loot;
    return {
      campaignId: constraints.campaignId,
      name: decisions.name?.full ?? `Unnamed ${race}`,
      race,
      background: decisions.background ?? null,
      profession: decisions.profession ?? null,
      alignment: decisions.alignment ?? 'Neutral',
      size: this.resolveSize(race),
      age: this.rollAge(ageRng, race),
      gender: decisions.name?.gender ?? null,
      appearance: decisions.appearance?.prose ?? null,
      personalityTraits: personality.traits,
      ideals: personality.ideals,
      bonds: personality.bonds,
      flaws: personality.flaws,
      statBlock: decisions.statBlock ?? null,
      goldPieces: loot?.coinage.gp ?? 0,
      silverPieces: loot?.coinage.sp ?? 0,
      copperPieces: loot?.coinage.cp ?? 0,
      loot: loot?.items ?? [],
      lootOverrides: this.normalizeLootOverrides(constraints.lootOverrides),
      generationParams: params,
    };
  }

  private normalizeLootOverrides(o: NpcLootOverrides | undefined): NpcLootOverrides | null {
    if (!o) return null;
    const cleaned: NpcLootOverrides = {};
    if (o.trinketChance !== undefined) cleaned.trinketChance = o.trinketChance;
    if (o.magicItemChance !== undefined) cleaned.magicItemChance = o.magicItemChance;
    if (o.itemCountDie !== undefined) cleaned.itemCountDie = o.itemCountDie;
    if (o.coinageMultiplier !== undefined) cleaned.coinageMultiplier = o.coinageMultiplier;
    return Object.keys(cleaned).length > 0 ? cleaned : null;
  }
}

function isWeaponAction(name: string): boolean {
  const lower = name.toLowerCase();
  return STATBLOCK_WEAPON_ACTION_KEYWORDS.some(kw => lower.includes(kw));
}

function rewriteWeaponDescription(description: string, weapon: string): string {
  // Preserve the stat-block math (the `Hit:` / `Melee Weapon Attack:` clauses)
  // while replacing only the weapon noun. We anchor on the first parenthesized
  // weapon phrase; if the base monster's description doesn't include one we
  // append a parenthetical so the swap is still visible to the DM.
  const withParen = description.replace(/\([^)]*\)/, `(${weapon})`);
  if (withParen !== description) return withParen;
  return `${description} (now wields a ${weapon})`;
}

function capitalizeWords(s: string): string {
  return s
    .split(/\s+/)
    .map(w => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
