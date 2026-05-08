-- AlterTable
ALTER TABLE "backgrounds" DROP COLUMN "feature";

-- AlterTable
ALTER TABLE "races" DROP COLUMN "traits";

-- AlterTable
ALTER TABLE "srd_classes" DROP COLUMN "features";

-- AlterTable
ALTER TABLE "subclasses" DROP COLUMN "features";

-- CreateTable
CREATE TABLE "class_features" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "class_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subclass_features" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "subclassId" TEXT NOT NULL,

    CONSTRAINT "subclass_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "race_traits" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,

    CONSTRAINT "race_traits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "background_features" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "backgroundId" TEXT NOT NULL,

    CONSTRAINT "background_features_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_features_name_idx" ON "class_features"("name");

-- CreateIndex
CREATE INDEX "class_features_classId_idx" ON "class_features"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "class_features_classId_name_key" ON "class_features"("classId", "name");

-- CreateIndex
CREATE INDEX "subclass_features_name_idx" ON "subclass_features"("name");

-- CreateIndex
CREATE INDEX "subclass_features_subclassId_idx" ON "subclass_features"("subclassId");

-- CreateIndex
CREATE UNIQUE INDEX "subclass_features_subclassId_name_key" ON "subclass_features"("subclassId", "name");

-- CreateIndex
CREATE INDEX "race_traits_name_idx" ON "race_traits"("name");

-- CreateIndex
CREATE INDEX "race_traits_raceId_idx" ON "race_traits"("raceId");

-- CreateIndex
CREATE UNIQUE INDEX "race_traits_raceId_name_key" ON "race_traits"("raceId", "name");

-- CreateIndex
CREATE INDEX "background_features_name_idx" ON "background_features"("name");

-- CreateIndex
CREATE INDEX "background_features_backgroundId_idx" ON "background_features"("backgroundId");

-- CreateIndex
CREATE UNIQUE INDEX "background_features_backgroundId_name_key" ON "background_features"("backgroundId", "name");

-- AddForeignKey
ALTER TABLE "class_features" ADD CONSTRAINT "class_features_classId_fkey" FOREIGN KEY ("classId") REFERENCES "srd_classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subclass_features" ADD CONSTRAINT "subclass_features_subclassId_fkey" FOREIGN KEY ("subclassId") REFERENCES "subclasses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_traits" ADD CONSTRAINT "race_traits_raceId_fkey" FOREIGN KEY ("raceId") REFERENCES "races"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "background_features" ADD CONSTRAINT "background_features_backgroundId_fkey" FOREIGN KEY ("backgroundId") REFERENCES "backgrounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
