-- CreateEnum
CREATE TYPE "AttachmentEntity" AS ENUM ('PRODUCT', 'SITE_SURVEY', 'INSTALLATION', 'SERVICE_TICKET');

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "entityType" "AttachmentEntity" NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "s3Key" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_s3Key_key" ON "Attachment"("s3Key");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_createdAt_idx" ON "Attachment"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

