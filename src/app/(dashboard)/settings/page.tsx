import { redirect } from "next/navigation";
import { Building2, ListChecks, Mail, Settings, Timer, Waypoints } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canView } from "@/lib/rbac";
import { OPTION_GROUPS, OPTION_GROUP_KEYS, getCompanyProfile, getSlaPolicies } from "@/lib/settings";
import { TICKET_PRIORITY } from "@/lib/statuses";
import { PageHeader, SectionCard, Badge } from "@/components/ui";
import { AutoForm } from "@/components/auto-form";
import { ActionButton } from "@/components/action-forms";
import { isMailConfigured } from "@/lib/mailer";
import { isWhatsAppCloudConfigured } from "@/lib/whatsapp-cloud";
import {
  addSettingOption,
  deleteSettingOption,
  toggleSettingOption,
  updateCompanyProfile,
  updateSlaPolicies,
} from "./actions";
import { saveAdminWhatsApp, sendDailyUpdateNow } from "./daily-update-actions";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user || !canView(session.user.role, "settings")) redirect("/");

  const [profile, sla, options, departments, admins] = await Promise.all([
    getCompanyProfile(),
    getSlaPolicies(),
    prisma.settingOption.findMany({ orderBy: [{ sortOrder: "asc" }, { value: "asc" }] }),
    prisma.department.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({
      where: { role: "ADMIN", active: true },
      select: { id: true, name: true, email: true, whatsappNumber: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const mailReady = isMailConfigured();
  const whatsappReady = isWhatsAppCloudConfigured();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Settings}
        title="Settings"
        description="Company details and the reference lists the rest of the CRM draws on."
      />

      <SectionCard title="Company profile" description="Printed on documents and used as the sender identity" icon={Building2}>
        <AutoForm
          action={updateCompanyProfile}
          submitLabel="Save company profile"
          fields={[
            { name: "legalName", label: "Legal name", required: true, defaultValue: profile?.legalName },
            { name: "tradeName", label: "Trade name", defaultValue: profile?.tradeName },
            { name: "gstin", label: "GSTIN", defaultValue: profile?.gstin, placeholder: "15-character GST number" },
            { name: "pan", label: "PAN", defaultValue: profile?.pan, placeholder: "10-character PAN" },
            { name: "address", label: "Address", defaultValue: profile?.address, span: 2 },
            { name: "city", label: "City", defaultValue: profile?.city },
            { name: "state", label: "State", defaultValue: profile?.state },
            { name: "pincode", label: "PIN code", defaultValue: profile?.pincode },
            { name: "phone", label: "Phone", kind: "tel", defaultValue: profile?.phone },
            { name: "email", label: "Email", kind: "email", defaultValue: profile?.email },
            { name: "website", label: "Website", kind: "url", defaultValue: profile?.website, placeholder: "https://" },
            {
              name: "logoUrl",
              label: "Logo link",
              kind: "url",
              defaultValue: profile?.logoUrl,
              placeholder: "https://",
              hint: "Link to an image hosted online.",
              span: 2,
            },
            {
              name: "bankDetails",
              label: "Bank details",
              kind: "textarea",
              defaultValue: profile?.bankDetails,
              placeholder: "Account name, number, IFSC, branch",
              span: 2,
            },
          ]}
        />
      </SectionCard>

      <SectionCard
        title="Daily update for administrators"
        description="Every morning at 8:00 (India time): what each person did yesterday, who did nothing, and what is overdue."
        icon={Mail}
      >
        <div className="space-y-5">
          <ul className="space-y-1.5 text-sm text-slate-600">
            <li className="flex items-center gap-2">
              <Badge tone={mailReady ? "success" : "warning"}>{mailReady ? "Email ready" : "Email not set up"}</Badge>
              {mailReady
                ? "Sent to each administrator's email address."
                : "Add the mail server settings to switch it on (see DEPLOYMENT.md)."}
            </li>
            <li className="flex items-center gap-2">
              <Badge tone={whatsappReady ? "success" : "warning"}>
                {whatsappReady ? "WhatsApp ready" : "WhatsApp not set up"}
              </Badge>
              {whatsappReady
                ? "Sent to each administrator's WhatsApp number below."
                : "Needs the company's WhatsApp Business API settings (see DEPLOYMENT.md). Until then it comes by email and shows on the dashboard."}
            </li>
          </ul>

          <div className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
            {admins.map((admin) => (
              <div key={admin.id} className="px-4 py-3">
                <p className="text-sm font-medium text-slate-800">{admin.name}</p>
                <p className="mb-2 text-xs text-slate-400">{admin.email}</p>
                <AutoForm
                  action={saveAdminWhatsApp}
                  submitLabel="Save number"
                  columns={1}
                  compact
                  fields={[
                    { kind: "hidden", name: "userId", value: admin.id },
                    {
                      name: "whatsappNumber",
                      label: "WhatsApp number",
                      kind: "tel",
                      defaultValue: admin.whatsappNumber ? `+${admin.whatsappNumber}` : "",
                      placeholder: "+91 98765 43210",
                      hint: "With the country code. Leave empty to stop WhatsApp messages for this administrator.",
                    },
                  ]}
                />
              </div>
            ))}
          </div>

          <div>
            <ActionButton
              action={sendDailyUpdateNow}
              hidden={{}}
              label="Send me today's update now"
              pendingLabel="Sending…"
              variant="primary"
            />
            <p className="mt-1.5 text-xs text-slate-400">
              Sends the update to your own email and WhatsApp number only, so you can check that it arrives.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Service SLAs"
        description="Hours allowed to resolve a ticket, by priority. Applied to tickets raised after you save."
        icon={Timer}
      >
        <AutoForm
          action={updateSlaPolicies}
          submitLabel="Save SLA targets"
          columns={2}
          fields={(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((priority) => ({
            name: priority,
            label: `${TICKET_PRIORITY[priority].label} priority (hours)`,
            kind: "number" as const,
            min: 1,
            required: true,
            defaultValue: sla[priority],
          }))}
        />
      </SectionCard>

      <div>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ListChecks className="size-4 text-slate-400" />
          Pick-lists
        </h2>
        <div className="grid gap-5 lg:grid-cols-2">
          {OPTION_GROUP_KEYS.map((group) => {
            const meta = OPTION_GROUPS[group];
            const rows = options.filter((o) => o.group === group);
            return (
              <SectionCard key={group} title={meta.label} description={meta.description} bodyClassName="p-0">
                {rows.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-slate-400">Nothing here yet.</p>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {rows.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-2">
                        <span className="flex min-w-0 items-center gap-2 text-sm text-slate-700">
                          <span className="truncate">{group === "WARRANTY_PERIOD" ? `${o.value} months` : o.value}</span>
                          {!o.active && <Badge tone="neutral">Hidden</Badge>}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <ActionButton
                            action={toggleSettingOption}
                            hidden={{ id: o.id }}
                            label={o.active ? "Hide" : "Show"}
                            variant="ghost"
                          />
                          <ActionButton
                            action={deleteSettingOption}
                            hidden={{ id: o.id }}
                            label="Delete"
                            variant="ghost"
                            confirm={`Remove “${o.value}” from this list? Existing records keep their value.`}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="border-t border-[var(--border)] px-5 py-4">
                  <AutoForm
                    action={addSettingOption}
                    submitLabel="Add"
                    columns={1}
                    compact
                    resetOnSuccess
                    fields={[
                      { kind: "hidden", name: "group", value: group },
                      {
                        name: "value",
                        label: "New value",
                        required: true,
                        placeholder: meta.placeholder,
                        kind: group === "WARRANTY_PERIOD" ? "number" : "text",
                      },
                    ]}
                  />
                </div>
              </SectionCard>
            );
          })}
        </div>
      </div>

      <SectionCard
        title="Pipeline stages"
        description="The department hand-off order every converted lead follows"
        icon={Waypoints}
      >
        <ol className="flex flex-wrap items-center gap-2">
          {departments.map((d, i) => (
            <li key={d.id} className="flex items-center gap-2">
              <Badge tone="brand">
                {i + 1}. {d.name}
              </Badge>
              {i < departments.length - 1 && <span className="text-slate-300">→</span>}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-slate-400">
          The stage order is built into the workflow, so it is shown here for reference rather than edited.
        </p>
      </SectionCard>
    </div>
  );
}
