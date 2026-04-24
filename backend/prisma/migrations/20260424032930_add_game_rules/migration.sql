-- CreateTable
CREATE TABLE "game_rules" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SRD 5.2.1',

    CONSTRAINT "game_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_rules_category_key_key" ON "game_rules"("category", "key");
