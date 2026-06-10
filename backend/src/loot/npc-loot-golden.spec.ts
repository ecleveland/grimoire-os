// Golden regression guard for VEG-297: snapshots of NpcPipeline.pickLoot output
// recorded BEFORE the loot logic was extracted into the shared LootRoller.
// These snapshots must never change as a side effect of the extraction — the
// shared engine has to reproduce today's NPC loot byte-for-byte.

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
