// Golden regression guard for NpcPipeline.pickLoot output. Originally recorded
// for VEG-297 to prove the extraction into the shared LootRoller reproduced NPC
// loot byte-for-byte; the snapshots should only ever move on a *deliberate*
// behavior change, never as an incidental side effect of a refactor.
//
// Updated for VEG-321: loot draws are now without-replacement by default, so
// rolls that previously emitted several identical rows (e.g. five separate
// Dagger lines) now collapse into one row with a summed quantity ("Dagger ×5").
// The regenerated snapshots capture that merged shape.

import { NpcPipeline } from '../npcs/generator/npc-pipeline';
import { buildSeedRefData } from '../npcs/generator/npc-pipeline.fixture';
import { SeededRng } from '../common/helpers/seeded-rng';
import { NpcGenerationConstraints } from '../npcs/generator/npc-generator.types';

const CAMPAIGN_ID = 'campaign-aaaa-bbbb-cccc-dddd';

const baseConstraints = (
  extra: Partial<NpcGenerationConstraints> = {}
): NpcGenerationConstraints => ({
  campaignId: CAMPAIGN_ID,
  ...extra,
});

describe('NpcPipeline.pickLoot — golden snapshots (pre-extraction behavior)', () => {
  const pipeline = () => new NpcPipeline(buildSeedRefData());

  it.each(['blacksmith', 'noble', 'mercenary', 'priest', 'peasant'])(
    'profession=%s, default overrides',
    profession => {
      const loots = ['seed-1', 'seed-2', 'seed-3'].map(seed =>
        pipeline().pickLoot(new SeededRng(`golden-${profession}-${seed}`), baseConstraints(), {
          profession,
        })
      );
      expect(loots).toMatchSnapshot();
    }
  );

  it('unknown profession falls back to the generic template', () => {
    const loot = pipeline().pickLoot(new SeededRng('golden-unknown'), baseConstraints(), {
      profession: 'astronaut',
    });
    expect(loot).toMatchSnapshot();
  });

  it('missing profession uses the generic template', () => {
    const loot = pipeline().pickLoot(new SeededRng('golden-no-prof'), baseConstraints(), {});
    expect(loot).toMatchSnapshot();
  });

  it('honors loot overrides (forced trinket + magic item, scaled coinage, bigger die)', () => {
    const loot = pipeline().pickLoot(
      new SeededRng('golden-overrides'),
      baseConstraints({
        lootOverrides: {
          trinketChance: 1,
          magicItemChance: 1,
          itemCountDie: '2d4',
          coinageMultiplier: 3,
        },
      }),
      { profession: 'merchant' }
    );
    expect(loot).toMatchSnapshot();
  });

  it('zeroed chances produce no trinket or magic item', () => {
    const loot = pipeline().pickLoot(
      new SeededRng('golden-zeroed'),
      baseConstraints({ lootOverrides: { trinketChance: 0, magicItemChance: 0 } }),
      { profession: 'hunter' }
    );
    expect(loot).toMatchSnapshot();
  });
});
