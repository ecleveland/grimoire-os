// Shared loot-roll engine (VEG-297), extracted verbatim from
// NpcPipeline.pickLoot. Pure — no Prisma, no I/O: callers supply pre-loaded
// templates/catalog data and a SeededRng (or a seed string). RNG consumption
// order is part of the contract: persisted NPC seeds must keep reproducing the
// exact loot they produced before the extraction.

import { SeededRng } from '../common/helpers/seeded-rng';
import { LootTemplateSelector } from './loot-template-selector';
import {
  GeneratedLoot,
  GeneratedLootItem,
  LootGameRules,
  LootItemRef,
  LootOverrides,
  LootTrinket,
} from './loot.types';

export type LootRollerData = {
  selectTemplate: LootTemplateSelector;
  trinkets: LootTrinket[];
  itemsByName: ReadonlyMap<string, LootItemRef>;
  magicItems: LootItemRef[];
  gameRules: LootGameRules;
  /**
   * Source tag persisted on template-rolled items. Defaults to 'profession'
   * (the NPC generator's historical tag); monster loot supplies its own once
   * VEG-298 widens the source union.
   */
  templateItemSource?: GeneratedLootItem['source'];
};

export type LootRollInput = {
  selectionKey: string | null;
  crBucket: string;
  overrides?: LootOverrides;
  /** Mid-stream RNG from a caller that has already consumed rolls (NPC pipeline). */
  rng?: SeededRng;
  /** Convenience for standalone callers; ignored when `rng` is given. */
  seed?: string;
};

export class LootRoller {
  constructor(private readonly data: LootRollerData) {}

  rollLoot(input: LootRollInput): GeneratedLoot {
    const rng = input.rng ?? (input.seed !== undefined ? new SeededRng(input.seed) : null);
    if (!rng) throw new Error('rollLoot requires an rng or seed');

    const overrides = input.overrides ?? {};
    const { crBucket } = input;
    const template = this.data.selectTemplate(input.selectionKey, crBucket);
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
          source: this.data.templateItemSource ?? 'profession',
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
      template: template ? { profession: template.key, crBucket: template.crBucket } : null,
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
}
