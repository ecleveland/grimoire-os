-- VEG-347: replace the bare knownSpells/preparedSpells string arrays with a
-- single structured `spells` JSONB column (SpellEntry[]), and add `attunedItems`
-- (AttunedItem[], cap of 3 enforced at the DTO layer). Data-preserving: existing
-- spell names migrate to name-only entries before the old columns are dropped.

-- 1. Add the new columns (nullable JSONB, matching the other embedded fields).
ALTER TABLE "characters"
  ADD COLUMN "spells" JSONB,
  ADD COLUMN "attunedItems" JSONB;

-- 2. Backfill `spells` from the old arrays. A name present in both knownSpells
--    and preparedSpells collapses to one entry with prepared = true (bool_or),
--    so the merge never duplicates a spell. Characters with no spells keep
--    `spells` NULL (consistent with the other optional embedded columns).
UPDATE "characters" AS c
SET "spells" = sub.agg
FROM (
  SELECT
    per_name.id,
    jsonb_agg(
      jsonb_build_object('level', 0, 'name', per_name.name, 'prepared', per_name.prepared)
      ORDER BY per_name.name
    ) AS agg
  FROM (
    SELECT s.id, s.name, bool_or(s.prepared) AS prepared
    FROM (
      SELECT c2.id, elem AS name, FALSE AS prepared
      FROM "characters" c2, unnest(c2."knownSpells") AS elem
      UNION ALL
      SELECT c2.id, elem AS name, TRUE AS prepared
      FROM "characters" c2, unnest(c2."preparedSpells") AS elem
    ) s
    GROUP BY s.id, s.name
  ) per_name
  GROUP BY per_name.id
) AS sub
WHERE c.id = sub.id;

-- 3. Drop the superseded columns.
ALTER TABLE "characters"
  DROP COLUMN "knownSpells",
  DROP COLUMN "preparedSpells";
