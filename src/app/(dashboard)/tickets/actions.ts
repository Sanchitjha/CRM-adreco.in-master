"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { requireUser, type SessionUser } from "@/lib/action-auth";
import { FIELD_ROLES, canCreate, canManage } from "@/lib/rbac";
import { canSeeLead } from "@/lib/scope";
import { nextNumber } from "@/lib/sequence";
import { getSlaPolicies } from "@/lib/settings";
import { slaDueAt } from "@/lib/lifecycle";
import type { ActionState } from "@/lib/action-state";
import { dateOrNull, firstIssueMessage, textOrNull } from "@/lib/validation/common";
import {
  addPartSchema,
  assignTicketSchema,
  createTicketSchema,
  removePartSchema,
  ticketIdSchema,
  ticketNotesSchema,
  updateTicketStatusSchema,
} from "@/lib/validation/ticket";

/** The ticket, if this user may work on it: managers always, the assigned technician on their own ticket. */
async function loadTicket(id: string, user: SessionUser) {
  const ticket = await prisma.serviceTicket.findUnique({ where: { id }, include: { lead: true } });
  if (!ticket) return { ticket: null, error: "Ticket not found." } as const;
  if (!canSeeLead(user.role, user.id, ticket.lead)) return { ticket: null, error: "You do not have access to this ticket." } as const;
  if (!canManage(user.role, "tickets") && ticket.assignedToId !== user.id) {
    return { ticket: null, error: "Only the assigned technician or the service team can change this ticket." } as const;
  }
  return { ticket, error: null } as const;
}

function revalidateTicket(id: string) {
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${id}`);
}

export async function createTicket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canCreate(user.role, "tickets")) return { error: "You do not have permission to raise service tickets." };

  const parsed = createTicketSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const lead = await prisma.lead.findUnique({ where: { id: d.leadId } });
  if (!lead) return { error: "That customer no longer exists." };
  if (!canSeeLead(user.role, user.id, lead)) return { error: "You do not have access to this customer." };

  const serialId = textOrNull(d.serialNumberId);
  if (serialId) {
    const unit = await prisma.serialNumber.findUnique({ where: { id: serialId }, select: { leadId: true } });
    if (!unit || unit.leadId !== lead.id) return { error: "That machine does not belong to this customer." };
  }

  const policies = await getSlaPolicies();
  const now = new Date();

  const ticket = await prisma.$transaction(async (tx) =>
    tx.serviceTicket.create({
      data: {
        ticketNumber: await nextNumber("TKT", tx),
        leadId: lead.id,
        serialNumberId: serialId,
        subject: d.subject,
        description: textOrNull(d.description),
        complaintType: textOrNull(d.complaintType),
        priority: d.priority,
        slaDueAt: slaDueAt(now, policies[d.priority]),
        visitScheduledFor: dateOrNull(d.visitScheduledFor),
        createdById: user.id,
      },
    }),
  );

  await logActivity({
    userId: user.id,
    action: "TICKET_RAISED",
    entityType: "ServiceTicket",
    entityId: ticket.id,
    details: { ticketNumber: ticket.ticketNumber, priority: d.priority },
  });

  revalidateTicket(ticket.id);
  redirect(`/tickets/${ticket.id}`);
}

export async function assignTicket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "tickets")) return { error: "Only the service team can assign tickets." };

  const parsed = assignTicketSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };

  const { ticket, error } = await loadTicket(parsed.data.ticketId, user);
  if (!ticket) return { error };
  if (ticket.status === "CLOSED") return { error: "Reopen the ticket before reassigning it." };

  const technician = await prisma.user.findUnique({
    where: { id: parsed.data.technicianId },
    select: { name: true, active: true, role: true },
  });
  if (!technician || !technician.active || !FIELD_ROLES.includes(technician.role)) {
    return { error: "Choose an active service or installation team member." };
  }

  await prisma.serviceTicket.update({
    where: { id: ticket.id },
    data: { assignedToId: parsed.data.technicianId, status: ticket.status === "OPEN" ? "ASSIGNED" : undefined },
  });
  await logActivity({
    userId: user.id,
    action: "TICKET_ASSIGNED",
    entityType: "ServiceTicket",
    entityId: ticket.id,
    details: { note: technician.name },
  });

  revalidateTicket(ticket.id);
  return { message: "Technician assigned." };
}

export async function updateTicketStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = updateTicketStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const { ticketId, status, note } = parsed.data;

  const { ticket, error } = await loadTicket(ticketId, user);
  if (!ticket) return { error };
  if (ticket.status === status) return {};

  if (ticket.status === "CLOSED" && !canManage(user.role, "tickets")) {
    return { error: "Only the service team can reopen a closed ticket." };
  }
  if (status !== "OPEN" && !ticket.assignedToId) return { error: "Assign a technician before moving the ticket on." };
  if (status === "CLOSED" && !ticket.resolution) return { error: "Record the resolution before closing the ticket." };

  await prisma.serviceTicket.update({
    where: { id: ticket.id },
    data: {
      status,
      closedAt: status === "CLOSED" ? new Date() : null,
    },
  });
  await logActivity({
    userId: user.id,
    action: "TICKET_STATUS_CHANGED",
    entityType: "ServiceTicket",
    entityId: ticket.id,
    details: { from: ticket.status, to: status, note: textOrNull(note) ?? "" },
  });

  revalidateTicket(ticket.id);
  return {};
}

export async function checkInTicket(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = ticketIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const { ticket, error } = await loadTicket(parsed.data.ticketId, user);
  if (!ticket) return { error };
  if (ticket.status === "CLOSED") return { error: "This ticket is closed." };

  // Checking in on an unassigned ticket takes it, if the person is field staff.
  const assignedToId = ticket.assignedToId ?? (FIELD_ROLES.includes(user.role) ? user.id : null);
  if (!assignedToId) return { error: "Assign a technician before checking in." };

  await prisma.serviceTicket.update({
    where: { id: ticket.id },
    data: {
      assignedToId,
      checkedInAt: new Date(),
      status: ticket.status === "OPEN" || ticket.status === "ASSIGNED" ? "VISIT" : undefined,
    },
  });
  await logActivity({ userId: user.id, action: "TECHNICIAN_CHECKED_IN", entityType: "ServiceTicket", entityId: ticket.id });

  revalidateTicket(ticket.id);
  return { message: "Checked in at site." };
}

export async function saveTicketNotes(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = ticketNotesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const { ticket, error } = await loadTicket(d.ticketId, user);
  if (!ticket) return { error };
  if (ticket.status === "CLOSED") return { error: "This ticket is closed." };

  await prisma.serviceTicket.update({
    where: { id: ticket.id },
    data: {
      diagnosis: textOrNull(d.diagnosis),
      resolution: textOrNull(d.resolution),
      customerSignedOffBy: textOrNull(d.customerSignedOffBy),
      visitScheduledFor: dateOrNull(d.visitScheduledFor),
    },
  });
  await logActivity({ userId: user.id, action: "TICKET_NOTES_UPDATED", entityType: "ServiceTicket", entityId: ticket.id });

  revalidateTicket(ticket.id);
  return { message: "Saved." };
}

export async function addTicketPart(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = addPartSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const { ticketId, productId, quantity } = parsed.data;

  const { ticket, error } = await loadTicket(ticketId, user);
  if (!ticket) return { error };
  if (ticket.status === "CLOSED") return { error: "This ticket is closed." };

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || !product.isSparePart) return { error: "Choose a spare part from the catalog." };

  const taken = await prisma.$transaction(async (tx) => {
    // The stock check and the deduction are one statement, so concurrent tickets cannot both take the last part.
    const deducted = await tx.product.updateMany({
      where: { id: productId, stockQty: { gte: quantity } },
      data: { stockQty: { decrement: quantity } },
    });
    if (deducted.count === 0) return false;

    const line = await tx.ticketPart.findFirst({ where: { ticketId: ticket.id, productId } });
    if (line) {
      await tx.ticketPart.update({ where: { id: line.id }, data: { quantity: { increment: quantity } } });
    } else {
      await tx.ticketPart.create({ data: { ticketId: ticket.id, productId, quantity } });
    }
    return true;
  });

  if (!taken) {
    const available = (await prisma.product.findUnique({ where: { id: productId }, select: { stockQty: true } }))?.stockQty ?? 0;
    return { error: `Only ${available} of ${product.name} in stock.` };
  }

  await logActivity({
    userId: user.id,
    action: "PART_USED",
    entityType: "ServiceTicket",
    entityId: ticket.id,
    details: { note: `${quantity} × ${product.name}` },
  });

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  revalidateTicket(ticket.id);
  return { message: `${quantity} × ${product.name} added. Stock updated.` };
}

export async function removeTicketPart(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = removePartSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const part = await prisma.ticketPart.findUnique({ where: { id: parsed.data.partId }, include: { product: true } });
  if (!part) return { error: "That part is no longer on the ticket." };

  const { ticket, error } = await loadTicket(part.ticketId, user);
  if (!ticket) return { error };
  if (ticket.status === "CLOSED") return { error: "This ticket is closed." };

  await prisma.$transaction([
    prisma.product.update({ where: { id: part.productId }, data: { stockQty: { increment: part.quantity } } }),
    prisma.ticketPart.delete({ where: { id: part.id } }),
  ]);
  await logActivity({
    userId: user.id,
    action: "PART_RETURNED",
    entityType: "ServiceTicket",
    entityId: ticket.id,
    details: { note: `${part.quantity} × ${part.product.name}` },
  });

  revalidatePath("/products");
  revalidatePath(`/products/${part.productId}`);
  revalidateTicket(ticket.id);
  return {};
}
