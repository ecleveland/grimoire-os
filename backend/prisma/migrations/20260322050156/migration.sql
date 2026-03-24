/*
  Warnings:

  - You are about to drop the column `abilityScores` on the `backgrounds` table. All the data in the column will be lost.
  - You are about to drop the column `feat` on the `backgrounds` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `feats` table. All the data in the column will be lost.
  - You are about to drop the column `level` on the `feats` table. All the data in the column will be lost.
  - You are about to drop the column `repeatable` on the `feats` table. All the data in the column will be lost.
  - You are about to drop the column `mastery` on the `items` table. All the data in the column will be lost.
  - You are about to drop the `species` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "backgrounds" DROP COLUMN "abilityScores",
DROP COLUMN "feat";

-- AlterTable
ALTER TABLE "feats" DROP COLUMN "category",
DROP COLUMN "level",
DROP COLUMN "repeatable";

-- AlterTable
ALTER TABLE "items" DROP COLUMN "mastery";

-- DropTable
DROP TABLE "species";
