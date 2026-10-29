-- CreateTable
CREATE TABLE "character_snapshots" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "label" TEXT,
    "data" JSONB NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "character_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "character_snapshots_characterId_takenAt_idx" ON "character_snapshots"("characterId", "takenAt");

-- AddForeignKey
ALTER TABLE "character_snapshots" ADD CONSTRAINT "character_snapshots_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "characters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
