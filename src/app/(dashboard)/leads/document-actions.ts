"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { canAccessDepartment } from "@/lib/rbac";
import { documentS3Key, getDownloadUrl, getUploadUrl } from "@/lib/s3";
import type { DocumentStatus } from "@prisma/client";

async function loadDocumentWithAccess(documentId: string) {
  const session = await auth();
  if (!session?.user) return { session: null, document: null, allowed: false };

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { lead: { include: { currentDepartment: true } } },
  });
  if (!document) return { session, document: null, allowed: false };

  const { role, id: userId } = session.user;
  const allowed =
    role === "ADMIN" ||
    document.lead.assignedToId === userId ||
    canAccessDepartment(role, document.lead.currentDepartment?.name);

  return { session, document, allowed };
}

export async function requestUploadUrl(documentId: string, fileName: string, contentType: string) {
  const { document, allowed } = await loadDocumentWithAccess(documentId);
  if (!document || !allowed) throw new Error("You do not have access to this document.");

  const key = documentS3Key(document.leadId, document.id, fileName);
  const url = await getUploadUrl(key, contentType);
  return { url, key };
}

export async function confirmUpload(documentId: string, s3Key: string, fileName: string) {
  const { session, document, allowed } = await loadDocumentWithAccess(documentId);
  if (!document || !allowed || !session?.user) throw new Error("You do not have access to this document.");

  await prisma.document.update({
    where: { id: documentId },
    data: { s3Key, fileName, status: "RECEIVED", uploadedById: session.user.id, uploadedAt: new Date() },
  });

  await logActivity({
    userId: session.user.id,
    action: "DOCUMENT_UPLOADED",
    entityType: "Document",
    entityId: documentId,
    details: { fileName, leadId: document.leadId },
  });

  revalidatePath(`/leads/${document.leadId}`);
}

export async function updateDocumentStatus(documentId: string, status: DocumentStatus) {
  const { session, document, allowed } = await loadDocumentWithAccess(documentId);
  if (!document || !allowed || !session?.user) throw new Error("You do not have access to this document.");

  await prisma.document.update({ where: { id: documentId }, data: { status } });

  await logActivity({
    userId: session.user.id,
    action: "DOCUMENT_STATUS_CHANGED",
    entityType: "Document",
    entityId: documentId,
    details: { status, leadId: document.leadId },
  });

  revalidatePath(`/leads/${document.leadId}`);
}

export async function requestDownloadUrl(documentId: string) {
  const { document, allowed } = await loadDocumentWithAccess(documentId);
  if (!document || !allowed || !document.s3Key) throw new Error("Document not available.");
  return getDownloadUrl(document.s3Key);
}

export async function addCustomDocumentRequirement(leadId: string, docType: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated.");

  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { currentDepartment: true } });
  if (!lead) throw new Error("Lead not found.");

  const allowed =
    session.user.role === "ADMIN" ||
    lead.assignedToId === session.user.id ||
    canAccessDepartment(session.user.role, lead.currentDepartment?.name);
  if (!allowed) throw new Error("You do not have access to this lead.");

  await prisma.document.create({ data: { leadId, docType, status: "REQUIRED" } });
  revalidatePath(`/leads/${leadId}`);
}
