import { FileStack, Images } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/action-auth";
import { loadAttachmentRights } from "@/lib/attachment-access";
import { kindOfContentType, type AttachmentEntityType } from "@/lib/attachments";
import { getAttachmentUrl } from "@/lib/s3";
import { SectionCard } from "@/components/ui";
import { AttachmentsView, type AttachmentItem } from "./attachments-view";

/**
 * The "Photos, videos and files" card of a product, site survey, installation or service ticket, or (variant "sheets")
 * the "Extra sheets" card of a quotation. It shows nothing to someone who may not open the item.
 */
export async function AttachmentsPanel({
  entityType,
  entityId,
  title,
  description,
  variant = "gallery",
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  title?: string;
  description?: string;
  variant?: "gallery" | "sheets";
}) {
  const user = await requireUser();
  const rights = await loadAttachmentRights(user, entityType, entityId);
  if (!rights?.view) return null;
  const sheets = variant === "sheets";

  const storageReady = !!process.env.S3_BUCKET_NAME;
  const rows = await prisma.attachment.findMany({
    where: { entityType, entityId },
    // Sheets print in the order they were added; a gallery shows the newest first.
    orderBy: { createdAt: sheets ? "asc" : "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });
  // Someone who cannot add sheets has nothing to look at when there are none.
  if (sheets && rows.length === 0 && !rights.upload) return null;

  const items: AttachmentItem[] = await Promise.all(
    rows.map(async (row) => {
      const kind = kindOfContentType(row.contentType) ?? "file";
      let url: string | null = null;
      if (storageReady) {
        try {
          // A PDF sheet opens in the browser's own viewer; any other file is offered as a download.
          url = await getAttachmentUrl(row.s3Key, { fileName: row.fileName, inline: sheets || kind !== "file" });
        } catch {
          url = null;
        }
      }
      return {
        id: row.id,
        fileName: row.fileName,
        size: row.size,
        kind,
        url,
        uploadedByName: row.uploadedBy.name,
        createdAt: row.createdAt.toISOString(),
        canRemove: rights.removeAny || (row.uploadedById === user.id && rights.upload),
      };
    }),
  );

  return (
    <SectionCard
      title={title ?? (sheets ? "Extra sheets" : "Photos, videos and files")}
      description={description}
      icon={sheets ? FileStack : Images}
    >
      <AttachmentsView
        entityType={entityType}
        entityId={entityId}
        items={items}
        canUpload={rights.upload}
        storageReady={storageReady}
        variant={variant}
      />
    </SectionCard>
  );
}
