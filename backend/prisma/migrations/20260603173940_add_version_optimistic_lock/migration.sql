-- AlterTable
ALTER TABLE "characters" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "encounters" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;
