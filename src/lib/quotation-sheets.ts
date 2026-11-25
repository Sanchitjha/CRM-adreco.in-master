import { prisma } from "@/lib/db";
import { sheetKindOf } from "@/lib/attachments";
import { getAttachmentUrl } from "@/lib/s3";
import type { PrintSheet } from "@/components/quotations/extra-sheets";

/**
 * The extra sheets of one quotation as the print page needs them, in the order they were added: each with a link that
 * works for the next hour. A sheet whose link cannot be made is left out rather than breaking the whole printout.
 * Empty when file storage is not set up. The caller has already checked that the person may open the quotation.
 */
export async function loadPrintSheets(quotationId: string): Promise<PrintSheet[]> {
  if (!process.env.S3_BUCKET_NAME) return [];

  const rows = await prisma.attachment.findMany({
    where: { entityType: "QUOTATION", entityId: quotationId },
    orderBy: { createdAt: "asc" },
  });

  const sheets: PrintSheet[] = [];
  for (const row of rows) {
    const kind = sheetKindOf(row.contentType);
    if (!kind) continue;
    try {
      const url = await getAttachmentUrl(row.s3Key, { fileName: row.fileName, inline: true });
      sheets.push({ id: row.id, name: row.fileName, kind, url });
    } catch {
      // See above: the other sheets still print.
    }
  }
  return sheets;
}
