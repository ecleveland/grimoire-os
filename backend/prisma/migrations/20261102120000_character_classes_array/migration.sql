-- Characters hold a list of classes instead of one class name, and hit dice as
-- one pool per die type.

-- AlterTable
ALTER TABLE "characters" ADD COLUMN "classes" JSONB NOT NULL DEFAULT '[]';

-- Fold the scalar class columns into a one-entry list. A row with no class, or
-- a blank one, gets the empty list, because a blank name would fail the entry
-- DTO's non-blank rule on every later write of the row. The entry level is floored at one because
-- a class entry always holds at least one level.
-- Wrap a stored hit-dice object in a one-pool array. SQL NULL, a jsonb null and
-- an array already in the new shape are left as they are, so running this
-- statement twice changes nothing the second time.
UPDATE "characters" SET
  "classes" = CASE
    WHEN "class" IS NOT NULL AND btrim("class") <> '' THEN jsonb_build_array(jsonb_build_object(
      'classId', "classId",
      'name', "class",
      'level', GREATEST("level", 1),
      'subclass', "subclass",
      'subclassId', NULL
    ))
    ELSE '[]'::jsonb
  END,
  "hitDice" = CASE
    WHEN jsonb_typeof("hitDice") = 'object' THEN jsonb_build_array("hitDice")
    ELSE "hitDice"
  END;

-- AlterTable
ALTER TABLE "characters" DROP COLUMN "class",
DROP COLUMN "classId",
DROP COLUMN "subclass";
