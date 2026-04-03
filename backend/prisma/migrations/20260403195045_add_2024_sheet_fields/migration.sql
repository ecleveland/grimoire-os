-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "armorTraining" TEXT[],
ADD COLUMN     "heroicInspiration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hitDice" JSONB,
ADD COLUMN     "size" TEXT,
ADD COLUMN     "weapons" JSONB;
