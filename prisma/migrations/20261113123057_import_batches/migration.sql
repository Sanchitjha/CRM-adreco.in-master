-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "importBatchId" TEXT;

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "period" TEXT,
    "leadsAdded" INTEGER NOT NULL DEFAULT 0,
    "contacts" INTEGER NOT NULL DEFAULT 0,
    "followUps" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportBatch_createdAt_idx" ON "ImportBatch"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_importBatchId_idx" ON "Lead"("importBatchId");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

