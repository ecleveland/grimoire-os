-- AlterTable
ALTER TABLE "feats" ADD COLUMN     "category" TEXT,
ADD COLUMN     "repeatable" BOOLEAN NOT NULL DEFAULT false;
