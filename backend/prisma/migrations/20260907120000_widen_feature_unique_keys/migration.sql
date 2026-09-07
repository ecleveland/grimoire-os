-- Let a class feature name recur at more than one level (VEG-507).
--
-- class_features and subclass_features were keyed [parentId, name], which makes
-- a recurring feature unrepresentable. Recurrence is how real classes are
-- written: Ability Score Improvement appears at levels 4, 8, 12, 16 and 19 in
-- every class in the game. The SRD seed never hit the limit — it omits ASI as a
-- universal rule and lists Extra Attack once per class — so the constraint went
-- unnoticed until VEG-506 let a user author a class by hand.
--
-- Safe to apply to a seeded database as-is: the level-inclusive key is strictly
-- weaker than the one it replaces, so every existing row still satisfies it and
-- no data has to move. The seed's createMany(skipDuplicates) de-dupes against
-- whichever unique index is present, and no SRD entry repeats a (name, level)
-- pair, so re-seed behaviour is unchanged.
--
-- The cost is on the other side: an SRD correction that moves a feature's level
-- now inserts a second row rather than updating in place. That is the same
-- shape of problem a name correction already had, not a new one, and the
-- re-seed properties are pinned in backend/test/db.
--
-- Dropped by name rather than with IF EXISTS: these are the identifiers Prisma
-- generated for @@unique([classId, name]) and @@unique([subclassId, name]), and
-- a rename upstream should fail here loudly rather than leave a stale index.
DROP INDEX "class_features_classId_name_key";
CREATE UNIQUE INDEX "class_features_classId_name_level_key" ON "class_features"("classId", "name", "level");

-- Subclass features are not authorable until VEG-509. Widened here anyway: the
-- two tables are the same shape, and a follow-up migration to bring one in line
-- with the other is a difference nobody would think to look for.
DROP INDEX "subclass_features_subclassId_name_key";
CREATE UNIQUE INDEX "subclass_features_subclassId_name_level_key" ON "subclass_features"("subclassId", "name", "level");
