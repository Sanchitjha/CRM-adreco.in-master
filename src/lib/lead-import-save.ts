import type { Prisma } from "@prisma/client";
import type { ImportRow } from "@/lib/lead-import";

const atMidnightUtc = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

/**
 * The database record for one imported prospect: the lead with its other contacts and its first follow-up, ready for
 * `lead.create`. The Import page and the demo seed both use it, so a prospect is saved the same way either way.
 */
export function leadFromImportRow(row: ImportRow, userId: string, assignedToId: string | null): Prisma.LeadUncheckedCreateInput {
  return {
    customerName: row.customerName,
    contactRole: row.contactRole,
    phone: row.phone,
    email: row.email,
    address: row.address,
    productCategory: row.productCategory,
    requirementNotes: row.requirementNotes,
    budget: row.budget,
    source: row.source ?? "Imported",
    referredBy: row.referredBy,
    status: row.status,
    assignedToId,
    createdById: userId,
    ...(row.enquiryDate ? { createdAt: atMidnightUtc(row.enquiryDate) } : {}),
    contacts: {
      create: row.contacts.map((c) => ({ name: c.name, role: c.role, phone: c.phone, email: c.email })),
    },
    followUps: row.followUp
      ? {
          create: [
            {
              userId,
              note: row.followUp.note,
              nextFollowUpDate: row.followUp.nextDate ? atMidnightUtc(row.followUp.nextDate) : null,
            },
          ],
        }
      : undefined,
  };
}
