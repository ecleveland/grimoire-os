/*
  Warnings:

  - The `traits` column on the `races` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "items" ADD COLUMN     "armorClass" INTEGER,
ADD COLUMN     "damageType" TEXT,
ADD COLUMN     "isMagic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rarity" TEXT,
ADD COLUMN     "requiresAttunement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'SRD 5.2.1',
ADD COLUMN     "stealthDisadvantage" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "strengthRequirement" INTEGER;

-- AlterTable
ALTER TABLE "monsters" ADD COLUMN     "armorType" TEXT,
ADD COLUMN     "conditionImmunities" TEXT[],
ADD COLUMN     "damageImmunities" TEXT[],
ADD COLUMN     "damageResistances" TEXT[],
ADD COLUMN     "damageVulnerabilities" TEXT[],
ADD COLUMN     "experiencePoints" INTEGER,
ADD COLUMN     "hitDice" TEXT,
ADD COLUMN     "languages" TEXT,
ADD COLUMN     "legendaryActions" JSONB,
ADD COLUMN     "reactions" JSONB,
ADD COLUMN     "savingThrows" JSONB,
ADD COLUMN     "senses" TEXT,
ADD COLUMN     "skills" JSONB,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'SRD 5.2.1',
ADD COLUMN     "specialAbilities" JSONB,
ADD COLUMN     "subtype" TEXT;

-- AlterTable
ALTER TABLE "races" ADD COLUMN     "age" TEXT,
ADD COLUMN     "alignment" TEXT,
ADD COLUMN     "sizeDescription" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'SRD 5.2.1',
DROP COLUMN "traits",
ADD COLUMN     "traits" JSONB;

-- AlterTable
ALTER TABLE "spells" ADD COLUMN     "higherLevels" TEXT,
ADD COLUMN     "material" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'SRD 5.2.1';

-- AlterTable
ALTER TABLE "srd_classes" ADD COLUMN     "equipmentChoices" JSONB,
ADD COLUMN     "numSkillChoices" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'SRD 5.2.1',
ADD COLUMN     "spellcasting" JSONB,
ADD COLUMN     "subclassLevel" INTEGER,
ADD COLUMN     "toolProficiencies" TEXT[];

-- CreateTable
CREATE TABLE "subclasses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "description" TEXT,
    "features" JSONB,
    "spellList" JSONB,
    "source" TEXT NOT NULL DEFAULT 'SRD 5.2.1',

    CONSTRAINT "subclasses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subraces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "description" TEXT,
    "abilityBonuses" JSONB,
    "traits" JSONB,
    "source" TEXT NOT NULL DEFAULT 'SRD 5.2.1',

    CONSTRAINT "subraces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backgrounds" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "skillProficiencies" TEXT[],
    "toolProficiencies" TEXT[],
    "languages" INTEGER NOT NULL DEFAULT 0,
    "equipment" TEXT,
    "feature" JSONB,
    "personalityTraits" TEXT[],
    "ideals" TEXT[],
    "bonds" TEXT[],
    "flaws" TEXT[],
    "source" TEXT NOT NULL DEFAULT 'SRD 5.2.1',

    CONSTRAINT "backgrounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feats" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "prerequisite" TEXT,
    "benefits" JSONB,
    "source" TEXT NOT NULL DEFAULT 'SRD 5.2.1',

    CONSTRAINT "feats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conditions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bullets" TEXT[],
    "source" TEXT NOT NULL DEFAULT 'SRD 5.2.1',

    CONSTRAINT "conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ability" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT NOT NULL DEFAULT 'SRD 5.2.1',

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "languages" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "typicalSpeakers" TEXT,
    "script" TEXT,
    "source" TEXT NOT NULL DEFAULT 'SRD 5.2.1',

    CONSTRAINT "languages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subclasses_name_key" ON "subclasses"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subraces_name_key" ON "subraces"("name");

-- CreateIndex
CREATE UNIQUE INDEX "backgrounds_name_key" ON "backgrounds"("name");

-- CreateIndex
CREATE UNIQUE INDEX "feats_name_key" ON "feats"("name");

-- CreateIndex
CREATE UNIQUE INDEX "conditions_name_key" ON "conditions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE UNIQUE INDEX "languages_name_key" ON "languages"("name");

-- CreateIndex
CREATE INDEX "items_category_idx" ON "items"("category");

-- CreateIndex
CREATE INDEX "monsters_type_idx" ON "monsters"("type");

-- CreateIndex
CREATE INDEX "monsters_challengeRating_idx" ON "monsters"("challengeRating");

-- CreateIndex
CREATE INDEX "spells_level_idx" ON "spells"("level");

-- CreateIndex
CREATE INDEX "spells_school_idx" ON "spells"("school");

-- AddForeignKey
ALTER TABLE "subclasses" ADD CONSTRAINT "subclasses_classId_fkey" FOREIGN KEY ("classId") REFERENCES "srd_classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subraces" ADD CONSTRAINT "subraces_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "races"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
