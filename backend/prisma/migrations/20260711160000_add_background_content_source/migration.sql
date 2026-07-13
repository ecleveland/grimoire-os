-- Make Background homebrew-capable (VEG-431), mirroring the feats family's
-- end-state (VEG-292 columns/indexes + the VEG-317 SET NULL/CHECK contract):
-- srd rows stay immutable seed content; homebrew rows are owned by their
-- creator; admin-published `shared` rows survive their author's deletion via
-- the SET NULL FK while homebrew is deleted explicitly by UsersService.remove,
-- backstopped by the CHECK below.

-- The global name unique moves to per-source partial unique indexes so a
-- user's homebrew background may reuse an SRD name.
DROP INDEX "backgrounds_name_key";

-- AlterTable
ALTER TABLE "backgrounds"
  ADD COLUMN "campaignId" TEXT,
  ADD COLUMN "contentSource" "ContentSource" NOT NULL DEFAULT 'srd',
  ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "backgrounds_contentSource_idx" ON "backgrounds"("contentSource");

-- CreateIndex
CREATE INDEX "backgrounds_createdById_idx" ON "backgrounds"("createdById");

-- AddForeignKey
ALTER TABLE "backgrounds"
  ADD CONSTRAINT "backgrounds_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A homebrew row may never lose its creator: a SET NULL firing on homebrew
-- would violate this CHECK and abort the delete, surfacing a service-layer
-- cleanup bug instead of silently orphaning rows (VEG-317).
--
-- NOTE: Prisma cannot model CHECK constraints or partial unique indexes in
-- schema.prisma, so they are hand-authored here (same convention as
-- VEG-292/310/317). A future `prisma migrate dev` will report them as drift
-- and offer to DROP them — do NOT accept that; re-add them in the new
-- migration. `prisma migrate deploy` (CI/prod) is unaffected.
ALTER TABLE "backgrounds"
  ADD CONSTRAINT "backgrounds_homebrew_has_creator_check"
  CHECK (("contentSource" <> 'homebrew') OR ("createdById" IS NOT NULL));

-- Partial unique indexes preserving the name guarantees we still want:
--   * SRD content keeps globally-unique names (the seed relies on it).
--   * A user cannot create two homebrew backgrounds with the same name;
--     different users may reuse names freely.
--   * Shared (admin-published) names are unique within the shared catalog.
CREATE UNIQUE INDEX "backgrounds_srd_name_key" ON "backgrounds"("name") WHERE "contentSource" = 'srd';
CREATE UNIQUE INDEX "backgrounds_homebrew_owner_name_key" ON "backgrounds"("name", "createdById") WHERE "contentSource" = 'homebrew';
CREATE UNIQUE INDEX "backgrounds_shared_name_key" ON "backgrounds"("name") WHERE "contentSource" = 'shared';
