"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { addContactSchema } from "@/lib/validation/lead";
import type { ActionState } from "@/lib/action-state";

/** Admins, and the person a lead is assigned to, may change who is listed on it. */
async function leadForEditing(leadId: string) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, assignedToId: true } });
  const allowed = !!lead && (session.user.role === "ADMIN" || lead.assignedToId === session.user.id);
  return { userId: session.user.id, lead: allowed ? lead : null };
}

export async function addLeadContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = addContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  const data = parsed.data;

  const { userId, lead } = await leadForEditing(data.leadId);
  if (!lead) return { error: "You do not have access to this lead." };

  const contact = await prisma.leadContact.create({
    data: {
      leadId: lead.id,
      name: data.name,
      role: data.role || null,
      phone: data.phone || null,
      email: data.email || null,
    },
  });
  await logActivity({
    userId,
    action: "LEAD_CONTACT_ADDED",
    entityType: "Lead",
    entityId: lead.id,
    details: { contactId: contact.id, name: contact.name, role: contact.role },
  });

  revalidatePath(`/leads/${lead.id}`);
  return { message: "Contact added." };
}

export async function removeLeadContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const contactId = String(formData.get("contactId") ?? "");
  const contact = contactId
    ? await prisma.leadContact.findUnique({ where: { id: contactId }, select: { id: true, leadId: true, name: true } })
    : null;
  if (!contact) return { error: "That contact no longer exists." };

  const { userId, lead } = await leadForEditing(contact.leadId);
  if (!lead) return { error: "You do not have access to this lead." };

  await prisma.leadContact.delete({ where: { id: contact.id } });
  await logActivity({
    userId,
    action: "LEAD_CONTACT_REMOVED",
    entityType: "Lead",
    entityId: lead.id,
    details: { name: contact.name },
  });

  revalidatePath(`/leads/${lead.id}`);
  return {};
}
