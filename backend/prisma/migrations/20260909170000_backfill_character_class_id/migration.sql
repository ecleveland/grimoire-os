-- Backfill Character."classId" for every character whose class name still
-- resolves to exactly one visible row (VEG-528).
--
-- VEG-524 added the column to stop a homebrew "Fighter" hijacking the SRD one,
-- but populated it from exactly one place: a user clicking a row in the class
-- picker. Every character predating the column, and every character created
-- through the API, kept a null id and stayed on the name heuristic — so the
-- protection covered almost nobody it was written for. Worse, VEG-528 makes the
-- read path refuse an ambiguous name instead of guessing a tier, so without this
-- backfill the first owner to author a homebrew "Wizard" would silently strip
-- spell slots from every Wizard they already had.
--
-- The match replicates the application rule exactly, and must keep doing so:
--
--   * lower(...) on both sides, because both resolvers fold case (the partial
--     unique indexes do not, so "Fighter" and "fighter" can be separate rows).
--   * scoped to what the character's OWNER can see — srd + shared globally, plus
--     that user's own homebrew. An unscoped join would pin a stranger's homebrew
--     class onto this character permanently.
--   * HAVING COUNT(*) = 1, so a colliding name is left null. That is not a gap:
--     a name matching two visible rows has no correct answer, which is the whole
--     premise of the ticket. Those characters keep resolving by name (i.e. to
--     nothing) until their owner re-picks the class in the editor, and the write
--     paths now derive an id whenever that name is unambiguous again.
--
-- MIN(sc.id) is not a tiebreak — HAVING guarantees the group holds one row, and
-- an aggregate is simply how that row's id is projected alongside the count.
--
-- Idempotent and re-runnable: it only ever writes rows that are currently null.
UPDATE "characters" c
SET "classId" = sub.id
FROM (
  SELECT ch.id AS character_id, MIN(sc.id) AS id
  FROM "characters" ch
  JOIN "srd_classes" sc
    ON lower(sc."name") = lower(ch."class")
   AND (
     sc."contentSource"::text IN ('srd', 'shared')
     OR sc."createdById" = ch."userId"
   )
  WHERE ch."classId" IS NULL
    AND ch."class" IS NOT NULL
    AND ch."class" <> ''
  GROUP BY ch.id
  HAVING COUNT(*) = 1
) sub
WHERE c.id = sub.character_id;
