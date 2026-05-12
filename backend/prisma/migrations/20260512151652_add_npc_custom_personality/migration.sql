-- CreateTable
CREATE TABLE "npc_custom_personality" (
    "id" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "addedById" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "npc_custom_personality_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "npc_custom_personality_background_kind_idx" ON "npc_custom_personality"("background", "kind");

-- AddForeignKey
ALTER TABLE "npc_custom_personality" ADD CONSTRAINT "npc_custom_personality_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
