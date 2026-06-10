-- DropIndex
DROP INDEX "npc_loot_templates_profession_crBucket_idx";

-- AlterTable
ALTER TABLE "npc_loot_templates" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'npc';

-- CreateIndex
CREATE INDEX "npc_loot_templates_category_profession_crBucket_idx" ON "npc_loot_templates"("category", "profession", "crBucket");
