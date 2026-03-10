-- CreateEnum
CREATE TYPE "Role" AS ENUM ('player', 'dungeon_master', 'admin');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('active', 'paused', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "NoteVisibility" AS ENUM ('private', 'party', 'dm_only');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "avatarUrl" TEXT,
    "role" "Role" NOT NULL DEFAULT 'player',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'active',
    "setting" TEXT,
    "currentSession" INTEGER NOT NULL DEFAULT 0,
    "inviteCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_players" (
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "campaign_players_pkey" PRIMARY KEY ("campaignId","userId")
);

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT,
    "race" TEXT,
    "class" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "subclass" TEXT,
    "background" TEXT,
    "alignment" TEXT,
    "experiencePoints" INTEGER NOT NULL DEFAULT 0,
    "abilityScores" JSONB,
    "hitPoints" JSONB,
    "deathSaves" JSONB,
    "armorClass" INTEGER,
    "speed" INTEGER,
    "initiative" INTEGER,
    "proficiencies" TEXT[],
    "languages" TEXT[],
    "savingThrows" TEXT[],
    "skills" TEXT[],
    "spellcastingAbility" TEXT,
    "spellSaveDC" INTEGER,
    "spellAttackBonus" INTEGER,
    "knownSpells" TEXT[],
    "preparedSpells" TEXT[],
    "spellSlots" JSONB,
    "inventory" JSONB,
    "currency" JSONB,
    "features" JSONB,
    "personalityTraits" TEXT,
    "ideals" TEXT,
    "bonds" TEXT,
    "flaws" TEXT,
    "backstory" TEXT,
    "appearance" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "campaignId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "visibility" "NoteVisibility" NOT NULL DEFAULT 'private',
    "sessionNumber" INTEGER,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encounters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "combatants" JSONB,
    "currentTurn" INTEGER NOT NULL DEFAULT 0,
    "round" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spells" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "school" TEXT NOT NULL,
    "castingTime" TEXT NOT NULL,
    "range" TEXT NOT NULL,
    "components" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "classes" TEXT[],
    "ritual" BOOLEAN NOT NULL DEFAULT false,
    "concentration" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "spells_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monsters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "alignment" TEXT,
    "armorClass" INTEGER NOT NULL,
    "hitPoints" INTEGER NOT NULL,
    "speed" TEXT NOT NULL,
    "str" INTEGER NOT NULL,
    "dex" INTEGER NOT NULL,
    "con" INTEGER NOT NULL,
    "int" INTEGER NOT NULL,
    "wis" INTEGER NOT NULL,
    "cha" INTEGER NOT NULL,
    "challengeRating" DOUBLE PRECISION NOT NULL,
    "actions" JSONB,
    "description" TEXT,

    CONSTRAINT "monsters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "cost" TEXT,
    "weight" DOUBLE PRECISION,
    "description" TEXT,
    "damage" TEXT,
    "properties" TEXT[],

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "srd_classes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hitDie" TEXT NOT NULL,
    "primaryAbilities" TEXT[],
    "savingThrows" TEXT[],
    "armorProficiencies" TEXT[],
    "weaponProficiencies" TEXT[],
    "skillChoices" TEXT[],
    "description" TEXT,
    "features" JSONB,

    CONSTRAINT "srd_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "races" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "speed" INTEGER NOT NULL,
    "size" TEXT NOT NULL,
    "abilityBonuses" JSONB,
    "traits" TEXT[],
    "languages" TEXT[],
    "description" TEXT,

    CONSTRAINT "races_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_inviteCode_key" ON "campaigns"("inviteCode");

-- CreateIndex
CREATE UNIQUE INDEX "spells_name_key" ON "spells"("name");

-- CreateIndex
CREATE UNIQUE INDEX "monsters_name_key" ON "monsters"("name");

-- CreateIndex
CREATE UNIQUE INDEX "items_name_key" ON "items"("name");

-- CreateIndex
CREATE UNIQUE INDEX "srd_classes_name_key" ON "srd_classes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "races_name_key" ON "races"("name");

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_players" ADD CONSTRAINT "campaign_players_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_players" ADD CONSTRAINT "campaign_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "characters" ADD CONSTRAINT "characters_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
