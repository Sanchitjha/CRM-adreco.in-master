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
  /** Why this lead was found, in words a person can check against what they typed. */
  reasons: string[];
};

/** Where a lead was found: its own phone number, or a number saved as another contact on it. */
type PhoneMatch = { id: string; via: "lead" | "contact"; contactName: string | null; contactRole: string | null };

/** The reasons a lead matches, as short sentences. The phone is shown as the person typed it. */
export function matchReasons(input: {
  phone: string;
  email?: string | null;
  ownNumber: boolean;
  contacts: { name: string; role: string | null }[];
  sameEmail: boolean;
}): string[] {
  const reasons: string[] = [];
  if (input.ownNumber) reasons.push(`Same phone number (${input.phone.trim()})`);
  for (const c of input.contacts) {
    reasons.push(`${input.phone.trim()} is the number of ${c.name}${c.role ? ` (${c.role})` : ""}, saved as a contact on this lead`);
  }
  if (input.sameEmail) reasons.push(`Same email address (${(input.email ?? "").trim()})`);
  return reasons;
}

/** Existing leads that share this phone number or email address, including a number saved as another contact. */
export async function findDuplicateLeads(phone: string, email?: string | null): Promise<DuplicateLead[]> {
  const key = phoneKey(phone);

  // Numbers are stored as typed ("+91 98765 43210", "98765-43210"), so compare digits only, in the database.
  const samePhone =
    key.length >= MIN_KEY_DIGITS
      ? await prisma.$queryRaw<PhoneMatch[]>`
          SELECT "id", 'lead' AS "via", NULL::text AS "contactName", NULL::text AS "contactRole" FROM "Lead"
          WHERE RIGHT(REGEXP_REPLACE("phone", '[^0-9]', '', 'g'), 10) = ${key}
          UNION ALL
          SELECT "leadId" AS "id", 'contact' AS "via", "name" AS "contactName", "role" AS "contactRole" FROM "LeadContact"
          WHERE "phone" IS NOT NULL AND RIGHT(REGEXP_REPLACE("phone", '[^0-9]', '', 'g'), 10) = ${key}
          LIMIT 50`
      : [];

  const or = [
    ...(samePhone.length > 0 ? [{ id: { in: [...new Set(samePhone.map((r) => r.id))] } }] : []),
    ...(email ? [{ email: { equals: email.trim(), mode: "insensitive" as const } }] : []),
  ];
  if (or.length === 0) return [];

  const matches = await prisma.lead.findMany({
    where: { OR: or },
    select: { id: true, customerName: true, phone: true, email: true, status: true, assignedTo: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return matches.map((l) => {
    const found = samePhone.filter((r) => r.id === l.id);
    return {
      id: l.id,
      customerName: l.customerName,
      phone: l.phone,
      status: l.status,
      ownerName: l.assignedTo?.name ?? null,
      reasons: matchReasons({
        phone,
        email,
        ownNumber: found.some((r) => r.via === "lead"),
        contacts: found.filter((r) => r.via === "contact").map((r) => ({ name: r.contactName ?? "another person", role: r.contactRole })),
        sameEmail: isSameEmail(l.email, email),
      }),
    };
  });
}
