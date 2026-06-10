-- DropForeignKey
ALTER TABLE "campaigns" DROP CONSTRAINT "campaigns_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "characters" DROP CONSTRAINT "characters_userId_fkey";

-- DropForeignKey
ALTER TABLE "encounters" DROP CONSTRAINT "encounters_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "encounters" DROP CONSTRAINT "encounters_createdById_fkey";

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_authorId_fkey";

-- DropForeignKey
ALTER TABLE "notes" DROP CONSTRAINT "notes_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "npc_custom_personality" DROP CONSTRAINT "npc_custom_personality_addedById_fkey";

-- DropForeignKey
ALTER TABLE "npcs" DROP CONSTRAINT "npcs_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "npcs" DROP CONSTRAINT "npcs_createdById_fkey";

-- AlterTable
ALTER TABLE "npc_custom_personality" ALTER COLUMN "addedById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "npc_custom_personality" ADD CONSTRAINT "npc_custom_personality_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
