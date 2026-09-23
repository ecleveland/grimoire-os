// Real-DB regression tests for LIKE-metacharacter handling in search (VEG-529).
//
// The unit suite mocks Prisma, so it can prove which pattern a query binds but
// never what Postgres does with it. The bug is entirely in what Postgres does:
// `mode: 'insensitive'` compiles to ILIKE and binds the value as a *pattern*, so
// `%` matched every row, `_` matched any single character, a name containing one
// of them could not be searched for at all, and a trailing backslash silently
// rewrote the query into a search for a literal percent sign. Only a database
// can fail on that.
//
// A trailing backslash does not abort anything, on any of these paths. Measured
// on Postgres 16.13: a pattern with a dangling escape returns false rather than
// raising 22025, and `contains` and `likeContainsPattern` append a `%` that
// consumes the escape before it can dangle at all. What it does instead is
// quietly change the query, which is what the cases below pin.
//
// The catalog is hand-built. Nine rows cover the three metacharacters, a decoy
// that only an unescaped pattern matches, and one homebrew row, which is enough
// to pin the Prisma `contains` path, both raw-SQL builders and the `equals`
// helper without any assertion depending on ordering or on the page size.
import {
  createSeedContext,
  noopCache,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';
import { ContentAccessService } from '../../src/srd/content-access.service';
import { SrdService, type UnifiedSearchHit } from '../../src/srd/srd.service';
import { catalogNameWhere } from '../../src/srd/resolve-catalog-ref';
import { HOMEBREW_SOURCE_LABEL } from '../../src/srd/homebrew-write.helpers';
import type { QuerySearchDto } from '../../src/srd/dto/query-search.dto';

// Base-36 rather than raw digits: the stamp rides along in every name, and a
// digit run can share trigrams with a numeric query, which would let pg_trgm
// similarity rescue a row the ILIKE assertions expect to be gone.
const RUN = Date.now().toString(36);
const stamped = (name: string) => `${name} ${RUN}`;

const FIRE_BOLT = stamped('Fire Bolt');
const PRIVATE_EMBER = stamped('Private Ember');
// Stamped on the front, alone among these rows, so the percent sign is the last
// character of the name. A trailing backslash in a query eats the wildcard the
// search appends, so only a pattern that then runs to the end of the string can
// tell the escaped form from the unescaped one.
const PERCENT_ROPE = `${RUN} Rope, Hemp 50%`;
// The decoy. `%50%%` (today's unescaped pattern for the query "50%") matches
// this; `%50\%%` (the escaped one) must not.
const PLAIN_ROPE = stamped('Rope, 500 Feet');
const BACKSLASH_CORD = stamped('Back\\slash Cord');
// A backslash at the end of a word, which is what a query ending in one has to
// match. Unescaped, `%Trailing\%` reads that backslash as escaping the wildcard
// and looks for a name ending in a literal percent sign, so it finds nothing.
const TRAILING_EDGE = stamped('Trailing\\ Edge');
const UNDERSCORE_FEAT = stamped('Under_Score');
const BACKSLASH_MONSTER = stamped('Back\\slash');
// Exercises catalogNameWhere, the `equals` half of the escaping.
const BLOOD_HUNTER = stamped('Blood_Hunter');
// Each of the remaining `contains` sites reads a different table, and a site
// with only one row in its table cannot tell a literal from a wildcard: both
// return that row. So every one of these gets a plain sibling to be excluded.
const PLAIN_FEAT = stamped('Plain Grit');
const UNDERSCORE_BACKGROUND = stamped('Sage_Scribe');
const PLAIN_BACKGROUND = stamped('Plain Farmhand');
const UNDERSCORE_FEATURE = stamped('Rite_of_Blood');
const PLAIN_FEATURE = stamped('Plain Rite');

// No metacharacter may appear in any description: every text predicate here
// searches name OR description, so a stray `%` would move the expected totals.
const PLAIN_TEXT = 'A plain fixture row with no pattern characters.';

const hitIds = (page: { data: UnifiedSearchHit[] }) => page.data.map(hit => hit.data.id);

describe('SRD search LIKE escaping on a real DB [VEG-529]', () => {
  let ctx: SeedContext;
  let srd: SrdService;
  let userAId: string;
  let userBId: string;
  let fireBoltId: string;
  let emberId: string;
  let percentRopeId: string;
  let plainRopeId: string;
  let backslashCordId: string;
  let trailingEdgeId: string;
  let underscoreFeatId: string;
  let backslashMonsterId: string;
  let bloodHunterId: string;
  let underscoreBackgroundId: string;
  let underscoreFeatureId: string;

  beforeAll(async () => {
    ctx = await createSeedContext();
    const { prisma } = ctx;
    await truncateAll(prisma);
    srd = new SrdService(prisma, new ContentAccessService(), noopCache);

    const [userA, userB] = await Promise.all([
      prisma.user.create({
        data: { username: `veg529-a-${RUN}`, passwordHash: 'x', displayName: 'User A' },
      }),
      prisma.user.create({
        data: { username: `veg529-b-${RUN}`, passwordHash: 'x', displayName: 'User B' },
      }),
    ]);
    userAId = userA.id;
    userBId = userB.id;

    const spellColumns = {
      level: 0,
      school: 'Evocation',
      castingTime: '1 action',
      range: '120 feet',
      components: 'V, S',
      duration: 'Instantaneous',
      description: PLAIN_TEXT,
    };

    const [
      fireBolt,
      ember,
      percentRope,
      plainRope,
      backslashCord,
      trailingEdge,
      feat,
      ,
      monster,
      bloodHunter,
    ] = await Promise.all([
      prisma.spell.create({ data: { name: FIRE_BOLT, ...spellColumns } }),
      prisma.spell.create({
        data: {
          name: PRIVATE_EMBER,
          ...spellColumns,
          contentSource: 'homebrew',
          createdById: userA.id,
          source: HOMEBREW_SOURCE_LABEL,
        },
      }),
      prisma.item.create({
        data: { name: PERCENT_ROPE, category: 'Adventuring Gear', description: PLAIN_TEXT },
      }),
      prisma.item.create({
        data: { name: PLAIN_ROPE, category: 'Adventuring Gear', description: PLAIN_TEXT },
      }),
      prisma.item.create({
        data: { name: BACKSLASH_CORD, category: 'Adventuring Gear', description: PLAIN_TEXT },
      }),
      prisma.item.create({
        data: { name: TRAILING_EDGE, category: 'Adventuring Gear', description: PLAIN_TEXT },
      }),
      prisma.feat.create({ data: { name: UNDERSCORE_FEAT, description: PLAIN_TEXT } }),
      prisma.feat.create({ data: { name: PLAIN_FEAT, description: PLAIN_TEXT } }),
      prisma.monster.create({
        data: {
          name: BACKSLASH_MONSTER,
          size: 'Medium',
          type: 'construct',
          armorClass: 12,
          hitPoints: 20,
          speed: '30 ft.',
          str: 10,
          dex: 10,
          con: 10,
          int: 10,
          wis: 10,
          cha: 10,
          challengeRating: 1,
          description: PLAIN_TEXT,
        },
      }),
      prisma.srdClass.create({ data: { name: BLOOD_HUNTER, hitDie: 'd10' } }),
    ]);
    fireBoltId = fireBolt.id;
    emberId = ember.id;
    percentRopeId = percentRope.id;
    plainRopeId = plainRope.id;
    backslashCordId = backslashCord.id;
    trailingEdgeId = trailingEdge.id;
    underscoreFeatId = feat.id;
    backslashMonsterId = monster.id;
    bloodHunterId = bloodHunter.id;

    // Backgrounds and class features are created after the class they hang off.
    const [underscoreBackground, underscoreFeature] = await Promise.all([
      prisma.background.create({ data: { name: UNDERSCORE_BACKGROUND, description: PLAIN_TEXT } }),
      prisma.classFeature.create({
        data: {
          name: UNDERSCORE_FEATURE,
          level: 1,
          description: PLAIN_TEXT,
          classId: bloodHunter.id,
        },
      }),
      prisma.background.create({ data: { name: PLAIN_BACKGROUND, description: PLAIN_TEXT } }),
      prisma.classFeature.create({
        data: { name: PLAIN_FEATURE, level: 2, description: PLAIN_TEXT, classId: bloodHunter.id },
      }),
    ]);
    underscoreBackgroundId = underscoreBackground.id;
    underscoreFeatureId = underscoreFeature.id;
  }, 60_000);

  afterAll(async () => {
    if (ctx) await teardownSeedContext(ctx);
  });

  describe('unified search', () => {
    const search = (q: string, userId?: string) => srd.search({ q } as QuerySearchDto, userId);

    it('matches a plain query for every caller', async () => {
      for (const userId of [undefined, userAId, userBId]) {
        const page = await search(FIRE_BOLT, userId);

        expect(page.total).toBe(1);
        expect(hitIds(page)).toEqual([fireBoltId]);
      }
    });

    // A bare `%` used to be the whole-catalog wildcard. Escaped, it is a literal
    // and matches only the one row that really contains a percent sign.
    it('treats a bare % as a literal, not as "every row"', async () => {
      const page = await search('%', userAId);

      expect(page.total).toBe(1);
      expect(hitIds(page)).toEqual([percentRopeId]);
    });

    // Same for `_`, which used to match any single character and so every row.
    // Three rows really hold one, so three is the whole answer, not a subset.
    it('treats a bare _ as a literal, not as "any character"', async () => {
      const page = await search('_', userAId);

      expect(page.total).toBe(3);
      expect(hitIds(page).sort()).toEqual(
        [bloodHunterId, underscoreFeatId, underscoreFeatureId].sort()
      );
    });

    it('finds a name containing a percent sign without matching the decoy', async () => {
      const page = await search('50%');

      expect(page.total).toBe(1);
      expect(hitIds(page)).toEqual([percentRopeId]);
      expect(hitIds(page)).not.toContain(plainRopeId);
    });

    it('finds a name containing an underscore', async () => {
      const page = await search('Under_Score');

      expect(page.total).toBe(1);
      expect(hitIds(page)).toEqual([underscoreFeatId]);
    });

    it('finds a name containing a backslash', async () => {
      const page = await search('Back\\slash');

      expect(page.total).toBe(1);
      expect(hitIds(page)).toEqual([backslashCordId]);
    });

    // A trailing backslash does not raise 22025 here, because `contains` and the
    // raw builders both append a `%`, which the stray escape then consumes. It
    // silently rewrites the query instead: unescaped, "Rope, Hemp 50\" ends up
    // searching for names ending in the literal text "Rope, Hemp 50%".
    it('neutralises a trailing backslash rather than letting it escape the wildcard', async () => {
      const page = await search('Rope, Hemp 50\\');

      expect(page.total).toBe(0);
      expect(hitIds(page)).not.toContain(percentRopeId);
    });

    // The other direction, and the one that proves the escape is emitted rather
    // than merely dropped: a row whose name really ends a word with a backslash
    // is found only by the escaped pattern.
    it('finds a name whose word ends in a backslash', async () => {
      const page = await search('Trailing\\');

      expect(page.total).toBe(1);
      expect(hitIds(page)).toEqual([trailingEdgeId]);
    });

    it('keeps homebrew scoped to its owner', async () => {
      const owner = await search('Private Ember', userAId);
      expect(hitIds(owner)).toEqual([emberId]);

      const other = await search('Private Ember', userBId);
      expect(other.total).toBe(0);

      const anonymous = await search('Private Ember');
      expect(anonymous.total).toBe(0);
    });

    // The unified search covers spells, feats, items, classes and features, so
    // the monster row is deliberately absent from these counts.
    it('returns every visible row when the query is empty', async () => {
      // 1 SRD spell + 4 items + 2 feats + 1 class + 2 class features, plus user
      // A's own homebrew spell. Backgrounds are not a search kind; their
      // features would be, and these hang off a class.
      expect((await srd.search({ q: '' } as QuerySearchDto, userAId)).total).toBe(11);
      expect((await srd.search({} as QuerySearchDto, userAId)).total).toBe(11);
      expect((await srd.search({} as QuerySearchDto, userBId)).total).toBe(10);
      expect((await srd.search({} as QuerySearchDto)).total).toBe(10);
    });
  });

  // The `equals` half of the escaping, and the only site where a trailing
  // backslash can still raise 22025, since nothing is appended to the pattern.
  // A Prisma change to how insensitive `equals` compiles would narrow this to
  // zero rows with the whole mocked unit suite still green.
  describe('catalogNameWhere', () => {
    const classesNamed = (name: string) =>
      ctx.prisma.srdClass.findMany({ where: catalogNameWhere(name) });

    it('resolves a name holding an underscore to exactly that row', async () => {
      const rows = await classesNamed(BLOOD_HUNTER);

      expect(rows.map(row => row.id)).toEqual([bloodHunterId]);
    });

    it('refuses to let a percent sign in the name act as a wildcard', async () => {
      expect(await classesNamed('Blood%')).toEqual([]);
      expect(await classesNamed('%')).toEqual([]);
    });

    // `equals` appends nothing, so this is the one path where an unescaped
    // trailing backslash really is left dangling. It resolves rather than
    // rejecting either way (see the header), so this pins the answer, not the
    // absence of an error: the name it is asked for does not exist, and the
    // dangling escape must not turn it into a prefix match on the row that does.
    it('answers a name ending in a backslash with no row', async () => {
      await expect(classesNamed(`${BLOOD_HUNTER}\\`)).resolves.toEqual([]);
    });
  });

  // The per-type searches take a different route: a single-character query uses
  // the Prisma `contains` filter, and anything longer builds raw SQL through
  // buildFuzzyMatchSql. Both bind patterns, so both need the same escaping.
  describe('per-type search', () => {
    it('treats a bare % as a literal on the Prisma contains path', async () => {
      const page = await srd.searchItems({ q: '%' });

      expect(page.total).toBe(1);
      expect(page.data.map(item => item.id)).toEqual([percentRopeId]);
    });

    it('treats a bare _ as a literal on the Prisma contains path', async () => {
      const page = await srd.searchMonsters({ q: '_' });

      expect(page.total).toBe(0);
    });

    // Only the positive half belongs here: on this path the similarity branch can
    // match a row the ILIKE pattern excludes, so a decoy's absence would be a
    // property of its trigram score rather than of the escaping. The unified
    // search, which is ILIKE and nothing else, asserts the exclusion.
    it('still matches a literal percent sign on the pg_trgm path', async () => {
      const page = await srd.searchItems({ q: '50%' });

      expect(page.data.map(item => item.id)).toContain(percentRopeId);
    });

    it('treats a bare % as a literal when searching spells', async () => {
      const page = await srd.searchSpells({ q: '%' }, userAId);

      // No spell holds a percent sign, so the literal matches nothing. Every
      // spell the caller can see comes back if it is read as a wildcard.
      expect(page.total).toBe(0);
    });

    it('treats a bare _ as a literal when searching feats', async () => {
      const page = await srd.searchFeats({ q: '_' });

      expect(page.data.map(row => row.id)).toEqual([underscoreFeatId]);
    });

    it('treats a bare _ as a literal when searching backgrounds', async () => {
      const rows = await srd.searchBackgrounds('_');

      expect(rows.map(row => row.id)).toEqual([underscoreBackgroundId]);
    });

    it('treats a bare _ as a literal when searching features', async () => {
      const page = await srd.searchFeatures({ q: '_' });

      expect(page.data.map(row => row.id)).toEqual([underscoreFeatureId]);
    });

    it('finds a monster whose name contains a backslash', async () => {
      const page = await srd.searchMonsters({ q: 'Back\\slash' });

      expect(page.data.map(monster => monster.id)).toContain(backslashMonsterId);
    });

    // No trailing-backslash case here: on the fuzzy path the similarity branch
    // matches the row whether or not the ILIKE pattern does, so the assertion
    // would hold against unescaped code. The unified search covers it.
  });
});
