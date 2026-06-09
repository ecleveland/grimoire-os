-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('srd', 'homebrew');

-- DropIndex
DROP INDEX "feats_name_key";

-- DropIndex
DROP INDEX "items_name_key";

-- DropIndex
DROP INDEX "monsters_name_key";

-- DropIndex
DROP INDEX "spells_name_key";

-- AlterTable
ALTER TABLE "feats" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "contentSource" "ContentSource" NOT NULL DEFAULT 'srd',
ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "contentSource" "ContentSource" NOT NULL DEFAULT 'srd',
ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "monsters" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "contentSource" "ContentSource" NOT NULL DEFAULT 'srd',
ADD COLUMN     "createdById" TEXT;

-- AlterTable
ALTER TABLE "spells" ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "contentSource" "ContentSource" NOT NULL DEFAULT 'srd',
ADD COLUMN     "createdById" TEXT;

-- CreateIndex
CREATE INDEX "feats_contentSource_idx" ON "feats"("contentSource");

-- CreateIndex
CREATE INDEX "feats_createdById_idx" ON "feats"("createdById");

-- CreateIndex
CREATE INDEX "items_contentSource_idx" ON "items"("contentSource");

-- CreateIndex
CREATE INDEX "items_createdById_idx" ON "items"("createdById");

-- CreateIndex
CREATE INDEX "monsters_contentSource_idx" ON "monsters"("contentSource");

-- CreateIndex
CREATE INDEX "monsters_createdById_idx" ON "monsters"("createdById");

-- CreateIndex
CREATE INDEX "spells_contentSource_idx" ON "spells"("contentSource");

-- CreateIndex
CREATE INDEX "spells_createdById_idx" ON "spells"("createdById");

-- AddForeignKey
ALTER TABLE "spells" ADD CONSTRAINT "spells_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monsters" ADD CONSTRAINT "monsters_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feats" ADD CONSTRAINT "feats_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Partial unique indexes (hand-authored — VEG-292) ───────────────────────
-- The global UNIQUE(name) constraint was dropped above so homebrew content can
-- reuse SRD names (a user's "Goblin" must coexist with the SRD "Goblin"). These
-- partial indexes preserve the guarantees we still want:
--   * SRD content keeps globally-unique names (the seed relies on it).
--   * A user cannot create two homebrew rows of the same type with the same name;
--     different users may reuse names freely (NULL createdById never collides).
-- Prisma cannot express partial/filtered unique indexes in schema.prisma, so they
-- live here. NOTE: a future `prisma migrate dev` will report these as drift and
-- offer to DROP them — do NOT accept that; re-add or keep them in the new
-- migration instead. `prisma migrate deploy` (CI/prod) is unaffected.
CREATE UNIQUE INDEX "spells_srd_name_key" ON "spells"("name") WHERE "contentSource" = 'srd';
CREATE UNIQUE INDEX "spells_homebrew_owner_name_key" ON "spells"("name", "createdById") WHERE "contentSource" = 'homebrew';

CREATE UNIQUE INDEX "monsters_srd_name_key" ON "monsters"("name") WHERE "contentSource" = 'srd';
CREATE UNIQUE INDEX "monsters_homebrew_owner_name_key" ON "monsters"("name", "createdById") WHERE "contentSource" = 'homebrew';

CREATE UNIQUE INDEX "items_srd_name_key" ON "items"("name") WHERE "contentSource" = 'srd';
CREATE UNIQUE INDEX "items_homebrew_owner_name_key" ON "items"("name", "createdById") WHERE "contentSource" = 'homebrew';

CREATE UNIQUE INDEX "feats_srd_name_key" ON "feats"("name") WHERE "contentSource" = 'srd';
CREATE UNIQUE INDEX "feats_homebrew_owner_name_key" ON "feats"("name", "createdById") WHERE "contentSource" = 'homebrew';
