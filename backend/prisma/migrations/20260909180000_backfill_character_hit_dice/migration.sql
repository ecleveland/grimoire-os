-- Backfill Character."hitDice" for every character already pinned to a class row
-- whose die is a real hit die (VEG-530).
--
-- Nothing populated this column server-side. `character-response.dto.ts` passes
-- it straight through, so every character created through the API, and every one
-- predating the guided builder, reached the sheet with a null pool — and four
-- separate clients each invented their own d8 for it. The classic editor was the
-- worst of them: it filled the gap on load and sent the field unconditionally on
-- save, so saving any unrelated field persisted the guess. After that the stored
-- die outranked the VEG-528 level-up picker, and the one place designed to ASK
-- which die a character uses never appeared again.
--
-- The resolution goes through "classId", not through the class name:
--
--   * The VEG-528 backfill (20260909170000) already pinned an id on exactly the
--     population this wants — every character whose name matched one visible row,
--     folding case — and left colliding and unknown names null. Joining on the id
--     inherits that rule instead of restating name matching, case folding and the
--     HAVING COUNT(*) = 1 in a second place where the two could drift apart.
--   * It therefore has to run AFTER that migration. The timestamps order them.
--
-- The visibility predicate is repeated even so. "classId" is a soft ref with no
-- FK behind it and a client can supply one directly, so an id naming a row this
-- owner cannot see must not seed their character from a stranger's homebrew.
--
-- The die is checked against the hit-die vocabulary (HIT_DIE_TYPES in
-- @grimoire-os/shared, mirrored here because SQL cannot import it). SrdClass
-- validates "hitDie" with @IsIn(DIE_TYPES), which carries d20 and d100 for the
-- roll vocabulary, and seeding a d100 pool would feed +51 a level into a
-- permanent HP maximum. Those characters keep a null pool, which is a handled
-- state: the level-up picker asks the player.
--
-- A level-N character owns N unspent hit dice. Unlike hit points, where the roll
-- belongs to the player, that total is fully derivable.
--
-- Idempotent and re-runnable: it only ever writes rows that are currently null,
-- so an existing pool keeps its die and its spent count.
UPDATE "characters" c
SET "hitDice" = jsonb_build_object(
  'dieType', sc."hitDie",
  'total', c."level",
  'spent', 0
)
FROM "srd_classes" sc
WHERE sc."id" = c."classId"
  AND (
    sc."contentSource"::text IN ('srd', 'shared')
    OR sc."createdById" = c."userId"
  )
  AND sc."hitDie" IN ('d4', 'd6', 'd8', 'd10', 'd12')
  -- Postgres runs at READ COMMITTED even inside Prisma Migrate's transaction, so
  -- this is both the row filter and the concurrency re-check: a pool written
  -- between the scan and the update re-evaluates here and is left alone.
  --
  -- SQL NULL specifically, which is what an omitted field and Prisma.DbNull both
  -- write. A plain `null` through the Prisma client stores the jsonb value
  -- 'null' instead, which is NOT NULL and so is skipped here. That is the right
  -- outcome rather than a gap: a client sending an explicit null is saying the
  -- sheet has no hit dice, and this migration should no more overwrite that than
  -- it overwrites a real pool. Nothing wrote explicit nulls before VEG-530, so
  -- no row predating this can be in that state anyway.
  AND c."hitDice" IS NULL;
