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
  /** In plain words, what the new lead has in common with this one, e.g. "Phone 98550 84749 is saved as a contact on this lead (Rohit, Owner)". */
  reasons: string[];
};

type PhoneHit = {
  leadId: string;
  phone: string;
  contactName: string | null;
  contactRole: string | null;
  /** "lead" when it is the lead's own number, "contact" when it belongs to another person saved on the lead. */
  source: "lead" | "contact";
};

/** Says why a number matched: the lead's own, or a person saved under the lead (the owner, the site in-charge...). */
export function describePhoneMatch(hit: Pick<PhoneHit, "phone" | "contactName" | "contactRole" | "source">): string {
  if (hit.source === "lead") return `Same phone number (${hit.phone}) as this lead's own number`;
  const who = [hit.contactName, hit.contactRole].filter(Boolean).join(", ");
  return `Phone ${hit.phone} is saved as a contact on this lead${who ? ` (${who})` : ""}`;
}

export function describeEmailMatch(email: string): string {
  return `Same email address (${email}) as this lead`;
}

/**
 * Existing leads that share this phone number or email address, including a number saved as another contact. Each
 * lead says what matched, so the person can tell a real repeat enquiry from a coincidence.
 */
export async function findDuplicateLeads(phone: string, email?: string | null): Promise<DuplicateLead[]> {
  const key = phoneKey(phone);

  // Numbers are stored as typed ("+91 98765 43210", "98765-43210"), so compare digits only, in the database.
  const phoneHits =
    key.length >= MIN_KEY_DIGITS
      ? await prisma.$queryRaw<PhoneHit[]>`
          SELECT "id" AS "leadId", "phone", NULL::text AS "contactName", NULL::text AS "contactRole", 'lead'::text AS "source"
          FROM "Lead"
          WHERE RIGHT(REGEXP_REPLACE("phone", '[^0-9]', '', 'g'), 10) = ${key}
          UNION ALL
          SELECT "leadId", "phone", "name" AS "contactName", "role" AS "contactRole", 'contact'::text AS "source"
          FROM "LeadContact"
          WHERE "phone" IS NOT NULL AND RIGHT(REGEXP_REPLACE("phone", '[^0-9]', '', 'g'), 10) = ${key}
          LIMIT 50`
      : [];

  const emailMatches = email
    ? await prisma.lead.findMany({
        where: { email: { equals: email.trim(), mode: "insensitive" } },
        select: { id: true, email: true },
        take: 25,
      })
    : [];

  const reasonsByLead = new Map<string, string[]>();
  const addReason = (leadId: string, reason: string) => {
    const list = reasonsByLead.get(leadId) ?? [];
    if (!list.includes(reason)) list.push(reason);
    reasonsByLead.set(leadId, list);
  };
  for (const hit of phoneHits) addReason(hit.leadId, describePhoneMatch(hit));
  for (const m of emailMatches) addReason(m.id, describeEmailMatch(m.email ?? email ?? ""));
  if (reasonsByLead.size === 0) return [];

  const matches = await prisma.lead.findMany({
    where: { id: { in: [...reasonsByLead.keys()] } },
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
    reasons: reasonsByLead.get(l.id) ?? [],
  }));
}
