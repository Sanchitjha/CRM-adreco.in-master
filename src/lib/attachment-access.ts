import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/action-auth";
import { canAccessSurveys, canManage, canView } from "@/lib/rbac";
import { canSeeLead } from "@/lib/scope";
import { attachmentRights, type AttachmentEntityType, type AttachmentFacts, type AttachmentRights } from "@/lib/attachments";

/**
 * What this person may do with the photos, videos and files of one product, survey, installation or ticket, using
 * the same rules as that item's own page. Null means there is no such item.
 */
export async function loadAttachmentRights(
  user: SessionUser,
  entityType: AttachmentEntityType,
  entityId: string,
): Promise<AttachmentRights | null> {
  const base = { role: user.role, userId: user.id };
  let facts: AttachmentFacts | null = null;

  switch (entityType) {
    case "PRODUCT": {
      const found = await prisma.product.findUnique({ where: { id: entityId }, select: { id: true } });
      if (found) {
        facts = {
          ...base,
          moduleView: canView(user.role, "products"),
          moduleManage: canManage(user.role, "products"),
          leadVisible: true,
        };
      }
      break;
    }
    case "SITE_SURVEY": {
      const s = await prisma.siteSurvey.findUnique({
        where: { id: entityId },
        select: { surveyedById: true, lead: { select: { assignedToId: true } } },
      });
      if (s) {
        facts = {
          ...base,
          moduleView: canAccessSurveys(user.role),
          moduleManage: false,
          leadVisible: true,
          assignedToId: s.surveyedById,
          leadOwnerId: s.lead.assignedToId,
        };
      }
      break;
    }
    case "INSTALLATION": {
      const j = await prisma.installation.findUnique({
        where: { id: entityId },
        select: { technicianId: true, lead: { select: { assignedToId: true } } },
      });
      if (j) {
        facts = {
          ...base,
          moduleView: canView(user.role, "installations"),
          moduleManage: canManage(user.role, "installations"),
          leadVisible: canSeeLead(user.role, user.id, j.lead),
          assignedToId: j.technicianId,
        };
      }
      break;
    }
    case "SERVICE_TICKET": {
      const t = await prisma.serviceTicket.findUnique({
        where: { id: entityId },
        select: { assignedToId: true, createdById: true, lead: { select: { assignedToId: true } } },
      });
      if (t) {
        facts = {
          ...base,
          moduleView: canView(user.role, "tickets"),
          moduleManage: canManage(user.role, "tickets"),
          leadVisible: canSeeLead(user.role, user.id, t.lead),
          assignedToId: t.assignedToId,
          createdById: t.createdById,
        };
      }
      break;
    }
  }

  return facts ? attachmentRights(entityType, facts) : null;
}
