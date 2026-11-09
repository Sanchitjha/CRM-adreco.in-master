-- CreateTable
CREATE TABLE "LeadAiAdvice" (
    "leadId" TEXT NOT NULL,
    "insight" JSONB NOT NULL,
    "inputHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadAiAdvice_pkey" PRIMARY KEY ("leadId")
);

-- AddForeignKey
ALTER TABLE "LeadAiAdvice" ADD CONSTRAINT "LeadAiAdvice_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

