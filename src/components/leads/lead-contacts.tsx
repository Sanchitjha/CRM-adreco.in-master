import { Mail, MessageCircle, Phone, Users } from "lucide-react";
import { SectionCard, Badge } from "@/components/ui";
import { AutoForm, type FieldDef } from "@/components/auto-form";
import { ActionButton } from "@/components/action-forms";
import { CONTACT_ROLES } from "@/lib/lead-options";
import { whatsappUrl } from "@/lib/phone";
import { addLeadContact, removeLeadContact } from "@/app/(dashboard)/leads/contact-actions";

export type LeadContactRow = { id: string; name: string; role: string | null; phone: string | null; email: string | null };

/** The other people on a prospect's project: the owner, the site in-charge, the contractor, the architect. */
export function LeadContacts({ leadId, contacts, canEdit }: { leadId: string; contacts: LeadContactRow[]; canEdit: boolean }) {
  const fields: FieldDef[] = [
    { kind: "hidden", name: "leadId", value: leadId },
    { name: "name", label: "Name", required: true },
    { name: "role", label: "Role", list: [...CONTACT_ROLES], placeholder: "e.g. Site in-charge" },
    { name: "phone", label: "Phone", kind: "tel" },
    { name: "email", label: "Email", kind: "email" },
  ];

  return (
    <SectionCard
      title="People on this project"
      description="Anyone else to call: owner, site in-charge, contractor…"
      icon={Users}
      bodyClassName="p-0"
    >
      {contacts.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-400">
          No other contacts yet.{canEdit ? " Add the site in-charge, contractor or architect so the whole team knows who to call." : ""}
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {contacts.map((c) => {
            const chat = c.phone ? whatsappUrl(c.phone) : null;
            return (
              <li key={c.id} className="space-y-1 px-5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{c.name}</p>
                    {c.role && (
                      <Badge tone="neutral" className="mt-0.5">
                        {c.role}
                      </Badge>
                    )}
                  </div>
                  {canEdit && (
                    <ActionButton
                      action={removeLeadContact}
                      hidden={{ contactId: c.id }}
                      label="Remove"
                      pendingLabel="Removing…"
                      variant="ghost"
                      confirm={`Remove ${c.name} from this project?`}
                    />
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  {c.phone && (
                    <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:text-brand-600">
                      <Phone className="size-3" />
                      {c.phone}
                    </a>
                  )}
                  {chat && (
                    <a href={chat} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-brand-600">
                      <MessageCircle className="size-3" />
                      WhatsApp
                    </a>
                  )}
                  {c.email && (
                    <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-brand-600">
                      <Mail className="size-3" />
                      {c.email}
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && (
        <div className="border-t border-[var(--border)] px-5 py-4">
          <p className="mb-3 text-xs font-medium text-slate-500">Add a person</p>
          <AutoForm action={addLeadContact} fields={fields} columns={1} compact submitLabel="Add contact" pendingLabel="Adding…" resetOnSuccess />
        </div>
      )}
    </SectionCard>
  );
}
