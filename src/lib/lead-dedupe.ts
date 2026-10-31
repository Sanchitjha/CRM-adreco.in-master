import { prisma } from "@/lib/db";

/** The part of a phone number that identifies the subscriber: its last ten digits, so +91 / 0 prefixes don't matter. */
export function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

/** Fewer digits than this is too little to call two numbers the same person. */
const MIN_KEY_DIGITS = 7;

export function isSamePhone(a: string, b: string): boolean {
  const ka = phoneKey(a);
  return ka.length >= MIN_KEY_DIGITS && ka === phoneKey(b);
}

export function isSameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type DuplicateLead = {
  id: string;
  customerName: string;
  phone: string;
  status: string;
  ownerName: string | null;
};

/** Existing leads that share this phone number or email address, including a number saved as another contact. */
export async function findDuplicateLeads(phone: string, email?: string | null): Promise<DuplicateLead[]> {
  const key = phoneKey(phone);

  // Numbers are stored as typed ("+91 98765 43210", "98765-43210"), so compare digits only, in the database.
  const samePhone =
    key.length >= MIN_KEY_DIGITS
      ? await prisma.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "Lead"
          WHERE RIGHT(REGEXP_REPLACE("phone", '[^0-9]', '', 'g'), 10) = ${key}
          UNION
          SELECT "leadId" AS "id" FROM "LeadContact"
          WHERE "phone" IS NOT NULL AND RIGHT(REGEXP_REPLACE("phone", '[^0-9]', '', 'g'), 10) = ${key}
          LIMIT 25`
      : [];

  const or = [
    ...(samePhone.length > 0 ? [{ id: { in: samePhone.map((r) => r.id) } }] : []),
    ...(email ? [{ email: { equals: email.trim(), mode: "insensitive" as const } }] : []),
  ];
  if (or.length === 0) return [];

  const matches = await prisma.lead.findMany({
    where: { OR: or },
    select: { id: true, customerName: true, phone: true, status: true, assignedTo: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return matches.map((l) => ({
    id: l.id,
    customerName: l.customerName,
    phone: l.phone,
    status: l.status,
    ownerName: l.assignedTo?.name ?? null,
  }));
}
