import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClipboardCheck, Gauge, PenLine, ScanBarcode, ShoppingCart, Wrench } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canView } from "@/lib/rbac";
import { canSeeLead } from "@/lib/scope";
import { fieldTechnicians } from "@/lib/people";
import { formatDate, formatDateTime, toDateInput } from "@/lib/dates";
import { parseInstallChecklist } from "@/lib/lifecycle";
import { COMMISSIONING_STATUS, INSTALLATION_STATUS, SERIAL_STATUS, statusOptions } from "@/lib/statuses";
import { Avatar, SectionCard } from "@/components/ui";
import { ActivityTimeline, BackLink, CustomerLink, InfoGrid, StatusPill } from "@/components/page-kit";
import { AutoForm, type FieldDef } from "@/components/auto-form";
import { ActionButton, SelectActionForm } from "@/components/action-forms";
import { InstallChecklist } from "@/components/installations/install-checklist";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { startCommissioning } from "../../commissioning/actions";
import {
  linkSerials,
  recordSignOff,
  unlinkSerial,
  updateInstallation,
  updateInstallationStatus,
} from "../actions";

export default async function InstallationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!canView(user.role, "installations")) redirect("/");

  const job = await prisma.installation.findUnique({
    where: { id },
    include: {
      lead: true,
      technician: true,
      createdBy: true,
      salesOrder: true,
      serialNumbers: { include: { product: true }, orderBy: { serialNo: "asc" } },
      commissioning: true,
    },
  });
  if (!job) notFound();
  if (!canSeeLead(user.role, user.id, job.lead)) notFound();

  const manage = canManage(user.role, "installations");
  const operate = manage || job.technicianId === user.id;
  const technicians = manage ? await fieldTechnicians() : [];

  const items = parseInstallChecklist(job.checklist);
  const open = job.status !== "COMPLETED" && job.status !== "CANCELLED";

  const detailFields: FieldDef[] = [
    { kind: "hidden", name: "installationId", value: job.id },
    { name: "siteAddress", label: "Site address", kind: "textarea", rows: 2, defaultValue: job.siteAddress, span: 2 },
    { name: "contactPerson", label: "Site contact", defaultValue: job.contactPerson },
    { name: "contactPhone", label: "Contact phone", kind: "tel", defaultValue: job.contactPhone },
    { name: "scheduledFor", label: "Scheduled for", kind: "date", defaultValue: toDateInput(job.scheduledFor) },
    ...(manage
      ? ([
          {
            kind: "select",
            name: "technicianId",
            label: "Technician",
            placeholder: "Unassigned",
            defaultValue: job.technicianId,
            options: technicians.map((t) => ({ value: t.id, label: t.name })),
          },
        ] as FieldDef[])
      : []),
    { name: "remarks", label: "Remarks", kind: "textarea", rows: 2, defaultValue: job.remarks, span: 2 },
  ];

  return (
    <div className="space-y-6">
      <BackLink href="/installations" label="Back to installations" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={job.lead.customerName} className="size-12 text-base" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{job.jobNumber}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              <CustomerLink role={user.role} leadId={job.lead.id} name={job.lead.customerName} />
              {job.technician ? ` · ${job.technician.name}` : " · Unassigned"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill meta={INSTALLATION_STATUS[job.status]} />
          {job.salesOrder && canView(user.role, "salesOrders") && (
            <Link href={`/sales-orders/${job.salesOrder.id}`} className="btn btn-secondary btn-sm">
              <ShoppingCart className="size-3.5" />
              {job.salesOrder.orderNumber}
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Installation checklist" description="Tick each step as it is completed on site" icon={ClipboardCheck} bodyClassName="p-0">
            <InstallChecklist installationId={job.id} items={items} editable={operate && open} />
          </SectionCard>

          <SectionCard
            title="Equipment"
            description="Machines installed on this job"
            icon={ScanBarcode}
            bodyClassName="p-0"
          >
            {job.serialNumbers.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">No serial numbers linked yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {job.serialNumbers.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      {canView(user.role, "serials") ? (
                        <Link href={`/serial-numbers/${u.id}`} className="text-sm font-medium text-slate-800 hover:text-brand-600">
                          {u.serialNo}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-slate-800">{u.serialNo}</span>
                      )}
                      <p className="text-xs text-slate-400">{u.product.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill meta={SERIAL_STATUS[u.status]} />
                      {operate && open && (
                        <ActionButton
                          action={unlinkSerial}
                          hidden={{ installationId: job.id, serialId: u.id }}
                          label="Remove"
                          variant="ghost"
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {operate && open && (
              <div className="border-t border-[var(--border)] px-5 py-4">
                <AutoForm
                  action={linkSerials}
                  submitLabel="Link units"
                  columns={1}
                  compact
                  resetOnSuccess
                  fields={[
                    { kind: "hidden", name: "installationId", value: job.id },
                    {
                      kind: "textarea",
                      name: "serials",
                      label: "Serial numbers installed",
                      rows: 2,
                      required: true,
                      placeholder: "One per line, or separated by commas",
                      hint: "Units must be dispatched to this customer. Warranty starts when the unit is commissioned.",
                    },
                  ]}
                />
              </div>
            )}
          </SectionCard>

          <SectionCard title="Customer sign-off" description="Required before the job can be completed" icon={PenLine}>
            {job.customerSignedBy ? (
              <p className="mb-4 text-sm text-slate-700">
                Signed off by <span className="font-medium text-slate-900">{job.customerSignedBy}</span> on{" "}
                {formatDateTime(job.customerSignedAt)}.
              </p>
            ) : (
              <p className="mb-4 text-sm text-slate-400">The customer has not signed off yet.</p>
            )}
            {operate && job.status !== "CANCELLED" && (
              <AutoForm
                action={recordSignOff}
                submitLabel={job.customerSignedBy ? "Update sign-off" : "Record sign-off"}
                columns={1}
                compact
                fields={[
                  { kind: "hidden", name: "installationId", value: job.id },
                  {
                    name: "signedBy",
                    label: "Name of the person signing for the customer",
                    required: true,
                    defaultValue: job.customerSignedBy,
                  },
                ]}
              />
            )}
          </SectionCard>

          <AttachmentsPanel
            entityType="INSTALLATION"
            entityId={job.id}
            description="Before and after photos, the finished installation, a commissioning video."
          />

          <ActivityTimeline entityType="Installation" entityId={job.id} />
        </div>

        <div className="space-y-6">
          {operate && (
            <SectionCard title="Status" description="Pending → scheduled → in progress → completed" icon={Wrench}>
              <SelectActionForm
                action={updateInstallationStatus}
                hidden={{ installationId: job.id }}
                name="status"
                current={job.status}
                options={statusOptions(INSTALLATION_STATUS)}
              />
              <p className="mt-3 text-xs text-slate-400">
                Completing a job needs every checklist step ticked and the customer&apos;s sign-off.
              </p>
            </SectionCard>
          )}

          {job.status === "COMPLETED" && (
            <SectionCard title="Commissioning" description="Validate performance and start the warranty" icon={Gauge}>
              {job.commissioning ? (
                <div className="flex items-center justify-between gap-3">
                  <StatusPill meta={COMMISSIONING_STATUS[job.commissioning.status]} />
                  {canView(user.role, "commissioning") && (
                    <Link href={`/commissioning/${job.commissioning.id}`} className="btn btn-secondary btn-sm">
                      Open report {job.commissioning.reportNumber}
                    </Link>
                  )}
                </div>
              ) : canManage(user.role, "commissioning") ? (
                <ActionButton
                  action={startCommissioning}
                  hidden={{ installationId: job.id }}
                  label="Start commissioning"
                  pendingLabel="Starting…"
                  variant="primary"
                  small={false}
                />
              ) : (
                <p className="text-sm text-slate-400">Waiting for the commissioning engineer.</p>
              )}
            </SectionCard>
          )}

          <SectionCard title="Job details" icon={Wrench}>
            {operate ? (
              <AutoForm action={updateInstallation} submitLabel="Save details" columns={1} compact fields={detailFields} />
            ) : (
              <InfoGrid
                columns={1}
                items={[
                  { label: "Site address", value: job.siteAddress },
                  { label: "Site contact", value: [job.contactPerson, job.contactPhone].filter(Boolean).join(" · ") },
                  { label: "Scheduled for", value: formatDate(job.scheduledFor) },
                  { label: "Technician", value: job.technician?.name },
                  { label: "Remarks", value: job.remarks },
                ]}
              />
            )}
            {(job.startedAt || job.completedAt) && (
              <p className="mt-4 text-xs text-slate-400">
                {job.startedAt ? `Started ${formatDate(job.startedAt)}` : ""}
                {job.startedAt && job.completedAt ? " · " : ""}
                {job.completedAt ? `Completed ${formatDate(job.completedAt)}` : ""}
              </p>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
