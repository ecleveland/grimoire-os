-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "concentration" JSONB,
ADD COLUMN     "conditions" TEXT[],
ADD COLUMN     "exhaustion" INTEGER;
