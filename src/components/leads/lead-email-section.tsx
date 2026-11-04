import { Mail } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { buildSignature } from "@/lib/email-compose";
import { emailTemplates } from "@/lib/email-templates";
import { isMailConfigured } from "@/lib/mailer";
import { ROLE_LABELS } from "@/lib/rbac";
import { getCompanyProfile } from "@/lib/settings";
import { formatINR } from "@/lib/utils";
import { SectionCard } from "@/components/ui";
import { LeadEmailPanel, type EmailRecipient } from "@/components/leads/lead-email-panel";
import type { Role } from "@prisma/client";

/** The "Email the customer" card on a lead: a composer, and what has been sent from the CRM so far. */
export async function LeadEmailSection({
  lead,
  viewer,
}: {
  lead: {
    id: string;
    customerName: string;
    email: string | null;
    productCategory: string | null;
    contacts: { name: string; role: string | null; email: string | null }[];
    documents: { id: string; fileName: string | null; s3Key: string | null }[];
  };
  viewer: { name: string; email: string; role: Role };
}) {
  const [emails, quote, profile] = await Promise.all([
    prisma.leadEmail.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { sentBy: { select: { name: true } } },
    }),
    prisma.quotation.findFirst({
      where: { leadId: lead.id },
      orderBy: { createdAt: "desc" },
      include: { items: true },
    }),
    getCompanyProfile(),
  ]);

  const recipients: EmailRecipient[] = [];
  const seen = new Set<string>();
  const addRecipient = (email: string | null, label: string) => {
    const key = email?.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    recipients.push({ email: key, label: `${label} (${key})` });
  };
  addRecipient(lead.email, lead.customerName);
  for (const contact of lead.contacts) addRecipient(contact.email, `${contact.name}${contact.role ? ` · ${contact.role}` : ""}`);

  const templates = emailTemplates({
    customerName: lead.customerName,
    productCategory: lead.productCategory,
    quote: quote
      ? {
          number: quote.quoteNumber,
          dateLabel: formatDate(quote.createdAt),
          validUntilLabel: quote.validUntil ? formatDate(quote.validUntil) : null,
          lines: quote.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            amountLabel: formatINR(Number(item.lineTotal)),
          })),
          totalLabel: formatINR(Number(quote.grandTotal)),
        }
      : null,
  });

  const companyName = profile?.tradeName || profile?.legalName || "Adreco Engineering Pvt Ltd";
  const signature = buildSignature(
    { name: viewer.name, email: viewer.email, roleLabel: ROLE_LABELS[viewer.role] },
    { name: companyName, phone: profile?.phone, website: profile?.website },
  );

  return (
    <SectionCard
      title="Email the customer"
      description="Sent from the company address. Replies come to you, and the team can see what was sent."
      icon={Mail}
    >
      <LeadEmailPanel
        leadId={lead.id}
        recipients={recipients}
        templates={templates}
        documents={lead.documents.filter((d) => d.s3Key && d.fileName).map((d) => ({ id: d.id, fileName: d.fileName! }))}
        history={emails.map((e) => ({
          id: e.id,
          subject: e.subject,
          to: e.toAddresses,
          cc: e.ccAddresses,
          sentBy: e.sentBy.name,
          at: e.createdAt.toISOString(),
          status: e.status,
          error: e.error,
          body: e.body,
          attachments: e.attachments,
        }))}
        configured={isMailConfigured()}
        signature={signature}
      />
    </SectionCard>
  );
}
