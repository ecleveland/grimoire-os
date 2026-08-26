-- Restore an index usable by the class name lookup, and index the subclass FK
-- (VEG-505 review).
--
-- add_class_content_source dropped the plain `srd_classes_name_key` and replaced
-- it with three PARTIAL unique indexes. loadClassData asks
--
--   WHERE name = $1 AND ("contentSource" IN ('srd','shared') OR "createdById" = $2)
--
-- which implies none of those three predicates, so Postgres seq-scans
-- srd_classes on every character detail read, save and level-up. Invisible at
-- twelve rows; not once VEG-506 lets every user add to the table.
--
-- Non-unique on purpose: duplicate names across tiers are the whole point of
-- the content-source model, and the per-tier uniqueness the partial indexes
-- give us is unaffected.
CREATE INDEX "srd_classes_name_idx" ON "srd_classes"("name");
CREATE INDEX "subclasses_name_idx" ON "subclasses"("name");

-- Postgres does not index a foreign key automatically. VEG-505 added a
-- `srdClass: { is: … }` relation filter to the subclass reads, which joins on
-- this column, and UsersService.remove deletes subclasses ahead of their parent
-- class — a RESTRICT check that also scans it.
CREATE INDEX "subclasses_classId_idx" ON "subclasses"("classId");
