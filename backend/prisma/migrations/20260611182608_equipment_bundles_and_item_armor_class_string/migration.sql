-- AlterTable
ALTER TABLE "items" ALTER COLUMN "armorClass" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "item_bundle_entries" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "item_bundle_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "item_bundle_entries_componentId_idx" ON "item_bundle_entries"("componentId");

-- CreateIndex
CREATE UNIQUE INDEX "item_bundle_entries_bundleId_componentId_key" ON "item_bundle_entries"("bundleId", "componentId");

-- AddForeignKey
ALTER TABLE "item_bundle_entries" ADD CONSTRAINT "item_bundle_entries_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_bundle_entries" ADD CONSTRAINT "item_bundle_entries_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
