-- Make SrdClass and Subclass homebrew-capable (VEG-505), mirroring the
-- background family's end-state (VEG-431, which itself mirrors VEG-292 columns/
-- indexes plus the VEG-317 SET NULL/CHECK contract): srd rows stay immutable
-- seed content; homebrew rows are owned by their creator; admin-published
-- `shared` rows survive their author's deletion via the SET NULL FK while
-- homebrew is deleted explicitly by UsersService.remove, backstopped by the
-- CHECKs below.
--
-- Nothing can create a homebrew class or subclass yet (that is VEG-506). With
-- zero homebrew rows every newly-scoped query returns exactly what the unscoped
-- one did, which is what makes this the safe point to add the columns.

-- The global name uniques move to per-source partial unique indexes so a user's
-- homebrew class may reuse an SRD class name.
DROP INDEX "srd_classes_name_key";
DROP INDEX "subclasses_name_key";

-- AlterTable
ALTER TABLE "srd_classes"
  ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "contentSource" "ContentSource" NOT NULL DEFAULT 'srd',
  ADD COLUMN "createdById" TEXT;

ALTER TABLE "subclasses"
  ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "contentSource" "ContentSource" NOT NULL DEFAULT 'srd',
  ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "srd_classes_contentSource_idx" ON "srd_classes"("contentSource");
CREATE INDEX "srd_classes_createdById_idx" ON "srd_classes"("createdById");
CREATE INDEX "subclasses_contentSource_idx" ON "subclasses"("contentSource");
CREATE INDEX "subclasses_createdById_idx" ON "subclasses"("createdById");

-- AddForeignKey
ALTER TABLE "srd_classes"
  ADD CONSTRAINT "srd_classes_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "subclasses"
  ADD CONSTRAINT "subclasses_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A homebrew row may never lose its creator: a SET NULL firing on homebrew
-- would violate these CHECKs and abort the delete, surfacing a service-layer
-- cleanup bug instead of silently orphaning rows (VEG-317).
--
-- NOTE: Prisma cannot model CHECK constraints or partial unique indexes in
-- schema.prisma, so they are hand-authored here (same convention as
-- VEG-292/310/317/431). A future `prisma migrate dev` will report them as drift
-- and offer to DROP them -- do NOT accept that; re-add them in the new
-- migration. `prisma migrate deploy` (CI/prod) is unaffected.
ALTER TABLE "srd_classes"
  ADD CONSTRAINT "srd_classes_homebrew_has_creator_check"
  CHECK (("contentSource" <> 'homebrew') OR ("createdById" IS NOT NULL));

ALTER TABLE "subclasses"
  ADD CONSTRAINT "subclasses_homebrew_has_creator_check"
  CHECK (("contentSource" <> 'homebrew') OR ("createdById" IS NOT NULL));

-- Partial unique indexes preserving the name guarantees we still want:
--   * SRD content keeps globally-unique names (the seed relies on it).
--   * A user cannot create two homebrew classes with the same name;
--     different users may reuse names freely.
--   * Shared (admin-published) names are unique within the shared catalog.
CREATE UNIQUE INDEX "srd_classes_srd_name_key" ON "srd_classes"("name") WHERE "contentSource" = 'srd';
CREATE UNIQUE INDEX "srd_classes_homebrew_owner_name_key" ON "srd_classes"("name", "createdById") WHERE "contentSource" = 'homebrew';
CREATE UNIQUE INDEX "srd_classes_shared_name_key" ON "srd_classes"("name") WHERE "contentSource" = 'shared';

-- Subclasses key the homebrew index on the parent class too. A subclass is
-- scoped by its parent (ClassFeature is already keyed [classId, name]), so one
-- author writing "Path of Ash" under both Barbarian and Fighter is legitimate.
-- The srd index stays on bare "name" because the seed relies on that guarantee.
CREATE UNIQUE INDEX "subclasses_srd_name_key" ON "subclasses"("name") WHERE "contentSource" = 'srd';
CREATE UNIQUE INDEX "subclasses_homebrew_owner_name_key" ON "subclasses"("name", "createdById", "classId") WHERE "contentSource" = 'homebrew';
CREATE UNIQUE INDEX "subclasses_shared_name_key" ON "subclasses"("name") WHERE "contentSource" = 'shared';
