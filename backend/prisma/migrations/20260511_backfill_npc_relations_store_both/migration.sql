-- Backfill mirror rows for one-sided NpcRelation records so every relation
-- is persisted as a bidirectional pair (store-both semantics from VEG-250).
-- Idempotent: only inserts the mirror when it does not already exist.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "npc_relations" ("id", "fromNpcId", "toNpcId", "relation", "notes")
SELECT
    gen_random_uuid()::text,
    r."toNpcId",
    r."fromNpcId",
    CASE r."relation"
        WHEN 'parent' THEN 'child'
        WHEN 'child' THEN 'parent'
        WHEN 'mentor' THEN 'student'
        WHEN 'student' THEN 'mentor'
        WHEN 'boss' THEN 'subordinate'
        WHEN 'subordinate' THEN 'boss'
        ELSE r."relation"
    END,
    r."notes"
FROM "npc_relations" r
WHERE NOT EXISTS (
    SELECT 1
    FROM "npc_relations" m
    WHERE m."fromNpcId" = r."toNpcId"
      AND m."toNpcId" = r."fromNpcId"
      AND m."relation" = (
          CASE r."relation"
              WHEN 'parent' THEN 'child'
              WHEN 'child' THEN 'parent'
              WHEN 'mentor' THEN 'student'
              WHEN 'student' THEN 'mentor'
              WHEN 'boss' THEN 'subordinate'
              WHEN 'subordinate' THEN 'boss'
              ELSE r."relation"
          END
      )
);
