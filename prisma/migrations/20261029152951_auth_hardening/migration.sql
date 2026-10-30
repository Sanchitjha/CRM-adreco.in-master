-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LoginFailure" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginFailure_email_createdAt_idx" ON "LoginFailure"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginFailure_ip_createdAt_idx" ON "LoginFailure"("ip", "createdAt");
