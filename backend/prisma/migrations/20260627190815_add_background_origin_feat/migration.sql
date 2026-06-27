-- AlterTable
ALTER TABLE "backgrounds" ADD COLUMN     "originFeatId" TEXT,
ADD COLUMN     "originFeatOption" TEXT;

-- CreateIndex
CREATE INDEX "backgrounds_originFeatId_idx" ON "backgrounds"("originFeatId");

-- AddForeignKey
ALTER TABLE "backgrounds" ADD CONSTRAINT "backgrounds_originFeatId_fkey" FOREIGN KEY ("originFeatId") REFERENCES "feats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
