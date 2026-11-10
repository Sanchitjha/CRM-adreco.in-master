import { Images } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/action-auth";
import { loadAttachmentRights } from "@/lib/attachment-access";
import { kindOfContentType, type AttachmentEntityType } from "@/lib/attachments";
import { getAttachmentUrl } from "@/lib/s3";
import { SectionCard } from "@/components/ui";
import { AttachmentsView, type AttachmentItem } from "./attachments-view";

/**
 * The "Photos, videos and files" card of a product, site survey, installation or service ticket. It shows nothing
 * to someone who may not open the item.
 */
export async function AttachmentsPanel({
  entityType,
  entityId,
  title = "Photos, videos and files",
  description,
}: {
  entityType: AttachmentEntityType;
  entityId: string;
  title?: string;
  description?: string;
}) {
  const user = await requireUser();
  const rights = await loadAttachmentRights(user, entityType, entityId);
  if (!rights?.view) return null;

  const storageReady = !!process.env.S3_BUCKET_NAME;
  const rows = await prisma.attachment.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { name: true } } },
  });

  const items: AttachmentItem[] = await Promise.all(
    rows.map(async (row) => {
      const kind = kindOfContentType(row.contentType) ?? "file";
      let url: string | null = null;
      if (storageReady) {
        try {
          url = await getAttachmentUrl(row.s3Key, { fileName: row.fileName, inline: kind !== "file" });
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
    <SectionCard title={title} description={description} icon={Images}>
      <AttachmentsView
        entityType={entityType}
        entityId={entityId}
        items={items}
        canUpload={rights.upload}
        storageReady={storageReady}
      />
    </SectionCard>
  );
}
