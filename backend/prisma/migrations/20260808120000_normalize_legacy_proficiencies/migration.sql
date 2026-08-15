-- Normalize pre-VEG-493 proficiency values (review of PR #256).
--
-- VEG-493 closed the write boundary on `characters.skills`,
-- `characters."savingThrows"` and `backgrounds."skillProficiencies"`, replacing
-- `@IsString({ each: true })` with a closed catalog. It shipped no backfill, so
-- every value already stored outside the catalog became a latent write block:
-- the character sheet and the background editor both round-trip the full array
-- on save, so one legacy entry 400s every subsequent edit of that row —
-- including edits to unrelated fields like current hit points. The guided
-- builder is worse: it copies a background's skillProficiencies onto the draft
-- character and exposes no editor for them, so a legacy background makes
-- character creation impossible with no in-wizard escape.
--
-- Values outside the catalog are dropped rather than remapped. They already had
-- no effect: `computed.skills` is keyed off the seeded ability-mappings rule, so
-- an unrecognised name produced no row and rendered as unproficient. Dropping
-- them removes a value that never did anything and restores the row to an
-- editable state; there is no safe automatic remapping for free text like
-- "Thieves' Tools" (a tool proficiency that was typed into a skills field).
--
-- Each statement is guarded by a containment check so rows that are already
-- canonical — the overwhelming majority — are not rewritten.

UPDATE "characters"
SET "skills" = ARRAY(
  SELECT s FROM unnest("skills") AS s
  WHERE s = ANY (ARRAY[
    'Athletics','Acrobatics','Sleight of Hand','Stealth','Arcana','History',
    'Investigation','Nature','Religion','Animal Handling','Insight','Medicine',
    'Perception','Survival','Deception','Intimidation','Performance','Persuasion'
  ])
)
WHERE NOT ("skills" <@ ARRAY[
  'Athletics','Acrobatics','Sleight of Hand','Stealth','Arcana','History',
  'Investigation','Nature','Religion','Animal Handling','Insight','Medicine',
  'Perception','Survival','Deception','Intimidation','Performance','Persuasion'
]);

UPDATE "characters"
SET "savingThrows" = ARRAY(
  SELECT s FROM unnest("savingThrows") AS s
  WHERE s = ANY (ARRAY[
    'Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'
  ])
)
WHERE NOT ("savingThrows" <@ ARRAY[
  'Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'
]);

-- spellcastingAbility gained the same catalog guard, and it is a scalar: an
-- unknown name resolved to a null ability key and rendered a wrong-but-plausible
-- spell save DC. Null it out rather than guessing which ability was meant.
UPDATE "characters"
SET "spellcastingAbility" = NULL
WHERE "spellcastingAbility" IS NOT NULL
  AND "spellcastingAbility" <> ALL (ARRAY[
    'Strength','Dexterity','Constitution','Intelligence','Wisdom','Charisma'
  ]);

UPDATE "backgrounds"
SET "skillProficiencies" = ARRAY(
  SELECT s FROM unnest("skillProficiencies") AS s
  WHERE s = ANY (ARRAY[
    'Athletics','Acrobatics','Sleight of Hand','Stealth','Arcana','History',
    'Investigation','Nature','Religion','Animal Handling','Insight','Medicine',
    'Perception','Survival','Deception','Intimidation','Performance','Persuasion'
  ])
)
WHERE NOT ("skillProficiencies" <@ ARRAY[
  'Athletics','Acrobatics','Sleight of Hand','Stealth','Arcana','History',
  'Investigation','Nature','Religion','Animal Handling','Insight','Medicine',
  'Perception','Survival','Deception','Intimidation','Performance','Persuasion'
]);
