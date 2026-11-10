"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { requireUser } from "@/lib/action-auth";
import { loadAttachmentRights } from "@/lib/attachment-access";
import {
  MAX_ATTACHMENTS_PER_ITEM,
  attachmentKey,
  attachmentPath,
  checkUpload,
  isAttachmentEntity,
  keyBelongsTo,
  safeFileName,
  type AttachmentEntityType,
} from "@/lib/attachments";
import { getObjectSize, getUploadUrl } from "@/lib/s3";

export type UploadTicket = { id: string; key: string; url: string; contentType: string; fileName: string };
export type RequestResult = { ok: true; ticket: UploadTicket } | { ok: false; error: string };
export type PlainResult = { ok: true } | { ok: false; error: string };

const LOG_ENTITY: Record<AttachmentEntityType, string> = {
  PRODUCT: "Product",
  SITE_SURVEY: "SiteSurvey",
  INSTALLATION: "Installation",
  SERVICE_TICKET: "ServiceTicket",
};

const NOT_ALLOWED = "You do not have access to add files here.";

/** Step 1 of an upload: check who and what, then hand back a short-lived link the browser sends the file to. */
export async function requestAttachmentUpload(
  entityType: string,
  entityId: string,
  fileName: string,
  contentType: string,
  size: number,
): Promise<RequestResult> {
  if (!isAttachmentEntity(entityType)) return { ok: false, error: "Unknown item." };
  if (!process.env.S3_BUCKET_NAME) return { ok: false, error: "File storage is not set up on this server." };

  const user = await requireUser();
  const rights = await loadAttachmentRights(user, entityType, entityId);
  if (!rights?.upload) return { ok: false, error: NOT_ALLOWED };

  const check = checkUpload({ fileName, contentType, size });
  if (!check.ok) return check;

  const existing = await prisma.attachment.count({ where: { entityType, entityId } });
  if (existing >= MAX_ATTACHMENTS_PER_ITEM) {
    return { ok: false, error: `Up to ${MAX_ATTACHMENTS_PER_ITEM} files can be added here. Remove some first.` };
  }

  const id = randomUUID();
  const key = attachmentKey(entityType, entityId, id, fileName);
  const url = await getUploadUrl(key, check.contentType);
  return { ok: true, ticket: { id, key, url, contentType: check.contentType, fileName: safeFileName(fileName) } };
}

/** Step 2: the browser says it sent the file. Check that it really is in storage, then record it. */
export async function confirmAttachment(
  entityType: string,
  entityId: string,
  id: string,
  key: string,
  fileName: string,
  contentType: string,
): Promise<PlainResult> {
  if (!isAttachmentEntity(entityType)) return { ok: false, error: "Unknown item." };

  const user = await requireUser();
  const rights = await loadAttachmentRights(user, entityType, entityId);
  if (!rights?.upload) return { ok: false, error: NOT_ALLOWED };
  if (!keyBelongsTo(key, entityType, entityId, id)) return { ok: false, error: "That upload does not belong here." };

  const size = await getObjectSize(key);
  if (size === null) return { ok: false, error: "The file did not reach storage. Please try again." };
  const check = checkUpload({ fileName, contentType, size });
  if (!check.ok) return check;

  try {
    await prisma.attachment.create({
      data: {
        id,
        entityType,
        entityId,
        fileName: safeFileName(fileName),
        contentType: check.contentType,
        size,
        s3Key: key,
        uploadedById: user.id,
      },
    });
  } catch {
    // The same upload confirmed twice: the first one already recorded it.
    const already = await prisma.attachment.findUnique({ where: { s3Key: key }, select: { id: true } });
    if (!already) return { ok: false, error: "The file could not be saved. Please try again." };
    return { ok: true };
  }

  await logActivity({
    userId: user.id,
    action: "ATTACHMENT_ADDED",
    entityType: LOG_ENTITY[entityType],
    entityId,
    details: { fileName: safeFileName(fileName), kind: check.kind },
  });
  revalidatePath(attachmentPath(entityType, entityId));
  return { ok: true };
}

/**
 * Takes a file off the list. The stored copy stays in the bucket (which keeps earlier versions and which the app
 * may not delete from), but nothing links to it any more.
 */
export async function removeAttachment(attachmentId: string): Promise<PlainResult> {
  const user = await requireUser();
  const row = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!row) return { ok: false, error: "That file is already gone." };

  const rights = await loadAttachmentRights(user, row.entityType, row.entityId);
  const mine = row.uploadedById === user.id && !!rights?.upload;
  if (!rights || !(rights.removeAny || mine)) return { ok: false, error: "You do not have access to remove this file." };

  await prisma.attachment.delete({ where: { id: row.id } });
  await logActivity({
    userId: user.id,
    action: "ATTACHMENT_REMOVED",
    entityType: LOG_ENTITY[row.entityType],
    entityId: row.entityId,
    details: { fileName: row.fileName },
  });
  revalidatePath(attachmentPath(row.entityType, row.entityId));
  return { ok: true };
}
