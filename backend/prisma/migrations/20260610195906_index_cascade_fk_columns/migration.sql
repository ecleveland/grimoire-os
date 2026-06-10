-- CreateIndex
CREATE INDEX "encounters_createdById_idx" ON "encounters"("createdById");

-- CreateIndex
CREATE INDEX "npc_custom_personality_addedById_idx" ON "npc_custom_personality"("addedById");

-- CreateIndex
CREATE INDEX "npcs_createdById_idx" ON "npcs"("createdById");
