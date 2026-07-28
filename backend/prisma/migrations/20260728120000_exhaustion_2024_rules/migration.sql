-- VEG-449: move the exhaustion rule from the 2014 tiered table to SRD 5.2.
--
-- This is a DATA migration, not a schema one. The computed-stats layer reads
-- the rule from the TypeScript seed source at module load, so an upgraded
-- backend applies the 2024 penalties immediately — while `game_rules` /
-- `conditions` still hold the 2014 text until someone re-seeds. Nothing in the
-- container entrypoint runs the seed (`prisma migrate deploy && node dist/main`),
-- so without this an instance would serve reference data that contradicts the
-- numbers its own character sheets show.
--
-- Both statements are idempotent and scoped to the rows the seed owns; a
-- database that has already been re-seeded is unaffected.

UPDATE "game_rules"
SET "value" = '{
  "maxLevel": 6,
  "d20PenaltyPerLevel": 2,
  "speedPenaltyFeetPerLevel": 5,
  "effects": {
    "1": "D20 Tests reduced by 2; Speed reduced by 5 feet",
    "2": "D20 Tests reduced by 4; Speed reduced by 10 feet",
    "3": "D20 Tests reduced by 6; Speed reduced by 15 feet",
    "4": "D20 Tests reduced by 8; Speed reduced by 20 feet",
    "5": "D20 Tests reduced by 10; Speed reduced by 25 feet",
    "6": "Death"
  }
}'::jsonb
WHERE "category" = 'exhaustion' AND "key" = 'levels';

-- The long-rest recovery prose: 2024 drops the "if fed" requirement. Behaviour
-- already matched (the rest helper just decrements); this corrects the text.
UPDATE "game_rules"
SET "value" = jsonb_set("value", '{exhaustionRecovery}', '"Remove 1 exhaustion level"')
WHERE "category" = 'resting' AND "key" = 'long-rest';

UPDATE "conditions"
SET
  "description" = 'While you have the Exhaustion condition, you experience its effects in a cumulative series of levels; you die if your Exhaustion level reaches 6.',
  "bullets" = ARRAY[
    'Exhaustion Levels: this condition is cumulative. Each time you receive it, you gain 1 Exhaustion level.',
    'D20 Tests Affected: when you make a D20 Test, the roll is reduced by 2 times your Exhaustion level.',
    'Speed Reduced: your Speed is reduced by a number of feet equal to 5 times your Exhaustion level.',
    'Level 6: death.',
    'Removing Exhaustion Levels: finishing a Long Rest removes 1 of your Exhaustion levels. When your Exhaustion level reaches 0, the condition ends.'
  ]
WHERE "name" = 'Exhaustion';
