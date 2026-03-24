-- AlterTable
ALTER TABLE "backgrounds" ADD COLUMN     "abilityScores" JSONB,
ADD COLUMN     "feat" TEXT;

-- AlterTable
ALTER TABLE "feats" ADD COLUMN     "category" TEXT,
ADD COLUMN     "level" INTEGER,
ADD COLUMN     "repeatable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "mastery" TEXT;

-- CreateTable
CREATE TABLE "species" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "speed" INTEGER NOT NULL,
    "size" TEXT NOT NULL,
    "traits" JSONB,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'SRD 5.2.1',

    CONSTRAINT "species_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "species_name_key" ON "species"("name");
