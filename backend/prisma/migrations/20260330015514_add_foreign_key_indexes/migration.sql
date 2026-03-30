-- CreateIndex
CREATE INDEX "campaigns_ownerId_idx" ON "campaigns"("ownerId");

-- CreateIndex
CREATE INDEX "characters_userId_idx" ON "characters"("userId");

-- CreateIndex
CREATE INDEX "characters_campaignId_idx" ON "characters"("campaignId");

-- CreateIndex
CREATE INDEX "encounters_campaignId_idx" ON "encounters"("campaignId");

-- CreateIndex
CREATE INDEX "notes_campaignId_idx" ON "notes"("campaignId");

-- CreateIndex
CREATE INDEX "notes_authorId_idx" ON "notes"("authorId");
