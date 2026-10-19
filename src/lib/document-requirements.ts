import type { Prisma } from "@prisma/client";

/** Documents that become required as soon as a lead enters a given department stage. */
export const DOCUMENT_REQUIREMENTS: Record<string, string[]> = {
  "Design & Engineering": ["Site Survey Report"],
  Accounts: ["Purchase Order (PO)", "Payment Proof", "Invoice"],
  Installation: ["Installation Completion Certificate"],
  Service: ["AMC Agreement"],
};

export async function createRequiredDocuments(
  tx: Prisma.TransactionClient,
  leadId: string,
  departmentName: string,
) {
  const docTypes = DOCUMENT_REQUIREMENTS[departmentName];
  if (!docTypes || docTypes.length === 0) return;

  await tx.document.createMany({
    data: docTypes.map((docType) => ({ leadId, docType, status: "REQUIRED" as const })),
  });
}
