-- CreateTable
CREATE TABLE "npcs" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "race" TEXT NOT NULL,
    "background" TEXT,
    "profession" TEXT,
    "alignment" TEXT,
    "size" TEXT,
    "age" INTEGER,
    "gender" TEXT,
    "appearance" TEXT,
    "personalityTraits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ideals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bonds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "flaws" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "statBlock" JSONB,
    "goldPieces" INTEGER NOT NULL DEFAULT 0,
    "silverPieces" INTEGER NOT NULL DEFAULT 0,
    "copperPieces" INTEGER NOT NULL DEFAULT 0,
    "loot" JSONB,
    "lootOverrides" JSONB,
    "generationParams" JSONB,
    "lockedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "npcs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "npc_relations" (
    "id" TEXT NOT NULL,
    "fromNpcId" TEXT NOT NULL,
    "toNpcId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "npc_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "npc_name_pools" (
    "id" TEXT NOT NULL,
    "race" TEXT NOT NULL,
    "gender" TEXT,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'curated',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "npc_name_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "npc_appearance_traits" (
    "id" TEXT NOT NULL,
    "race" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "trait" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'curated',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "npc_appearance_traits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "npc_loot_templates" (
    "id" TEXT NOT NULL,
    "profession" TEXT NOT NULL,
    "crBucket" TEXT NOT NULL,
    "coinage" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'curated',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "npc_loot_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "npc_alignment_priors" (
    "id" TEXT NOT NULL,
    "race" TEXT NOT NULL,
    "background" TEXT,
    "weights" INTEGER[],
    "source" TEXT NOT NULL DEFAULT 'curated',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "npc_alignment_priors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trinkets" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'curated',
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "trinkets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "npcs_campaignId_idx" ON "npcs"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "npc_relations_fromNpcId_toNpcId_relation_key" ON "npc_relations"("fromNpcId", "toNpcId", "relation");

-- CreateIndex
CREATE INDEX "npc_name_pools_race_kind_idx" ON "npc_name_pools"("race", "kind");

-- CreateIndex
CREATE INDEX "npc_appearance_traits_race_category_idx" ON "npc_appearance_traits"("race", "category");

-- CreateIndex
CREATE INDEX "npc_loot_templates_profession_crBucket_idx" ON "npc_loot_templates"("profession", "crBucket");

-- CreateIndex
CREATE UNIQUE INDEX "npc_alignment_priors_race_background_key" ON "npc_alignment_priors"("race", "background");

-- AddForeignKey
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "npcs" ADD CONSTRAINT "npcs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "npc_relations" ADD CONSTRAINT "npc_relations_fromNpcId_fkey" FOREIGN KEY ("fromNpcId") REFERENCES "npcs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "npc_relations" ADD CONSTRAINT "npc_relations_toNpcId_fkey" FOREIGN KEY ("toNpcId") REFERENCES "npcs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
