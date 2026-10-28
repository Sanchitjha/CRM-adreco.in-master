import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BadgeCheck, ClipboardCheck, Gauge, ScanBarcode, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canView } from "@/lib/rbac";
import { canSeeLead } from "@/lib/scope";
import { fieldTechnicians } from "@/lib/people";
import { formatDate, formatDateTime, toDateInput, today } from "@/lib/dates";
import { parseCommissioningChecklist, warrantyState } from "@/lib/lifecycle";
import { COMMISSIONING_STATUS, SERIAL_STATUS, WARRANTY_STATE } from "@/lib/statuses";
import { Avatar, SectionCard } from "@/components/ui";
import { ActivityTimeline, BackLink, CustomerLink, StatusPill } from "@/components/page-kit";
import { AutoForm, type FieldDef } from "@/components/auto-form";
import { CommissioningChecklist } from "@/components/commissioning/commissioning-checklist";
import { completeCommissioning, saveCommissioningDetails } from "../actions";

export default async function CommissioningDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!canView(user.role, "commissioning")) redirect("/");

  const report = await prisma.commissioning.findUnique({
    where: { id },
    include: {
      engineer: true,
      installation: {
        include: { lead: true, serialNumbers: { include: { product: true }, orderBy: { serialNo: "asc" } } },
      },
    },
  });
  if (!report) notFound();
  const { installation } = report;
  if (!canSeeLead(user.role, user.id, installation.lead)) notFound();

  const manage = canManage(user.role, "commissioning");
  const operate = manage || report.engineerId === user.id;
  const editable = operate && report.status === "IN_PROGRESS";
  const technicians = manage ? await fieldTechnicians() : [];
  const items = parseCommissioningChecklist(report.checklist);
  const todayDate = today();

  const detailFields: FieldDef[] = [
    { kind: "hidden", name: "commissioningId", value: report.id },
    ...(manage
      ? ([
          {
            kind: "select",
            name: "engineerId",
            label: "Commissioning engineer",
            placeholder: "Unassigned",
            defaultValue: report.engineerId,
            options: technicians.map((t) => ({ value: t.id, label: t.name })),
            span: 2,
          },
        ] as FieldDef[])
      : []),
    {
      kind: "checkbox",
      name: "customerDemoDone",
      label: "Customer demonstration given",
      defaultChecked: report.customerDemoDone,
      span: 2,
    },
    {
      name: "customerApprovedBy",
      label: "Approved by (customer)",
      defaultValue: report.customerApprovedBy,
      hint: "Name of the person who accepted the system.",
      span: 2,
    },
    { name: "engineerRemarks", label: "Engineer remarks", kind: "textarea", rows: 3, defaultValue: report.engineerRemarks, span: 2 },
  ];

  return (
    <div className="space-y-6">
      <BackLink href="/commissioning" label="Back to commissioning" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={installation.lead.customerName} className="size-12 text-base" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{report.reportNumber}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              <CustomerLink role={user.role} leadId={installation.lead.id} name={installation.lead.customerName} /> ·{" "}
              {report.engineer ? report.engineer.name : "No engineer assigned"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill meta={COMMISSIONING_STATUS[report.status]} />
          {canView(user.role, "installations") && (
            <Link href={`/installations/${installation.id}`} className="btn btn-secondary btn-sm">
              Job {installation.jobNumber}
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard
            title="Commissioning checklist"
            description="Electrical, water flow, temperature, pressure and performance"
            icon={ClipboardCheck}
            bodyClassName="p-0"
          >
            <CommissioningChecklist commissioningId={report.id} items={items} editable={editable} />
          </SectionCard>

          <SectionCard title="Equipment and warranty" icon={ScanBarcode} bodyClassName="p-0">
            {installation.serialNumbers.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">
                No equipment is linked to the installation job, so no warranty can be started. Link the serial numbers on
                the job first.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {installation.serialNumbers.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{u.serialNo}</p>
                      <p className="text-xs text-slate-400">
                        {u.product.name} · {u.product.warrantyMonths} months warranty
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill meta={SERIAL_STATUS[u.status]} />
                      {u.warrantyEndsOn && (
                        <>
                          <StatusPill meta={WARRANTY_STATE[warrantyState(u.warrantyEndsOn, todayDate)]} />
                          <span className="text-xs text-slate-400">till {formatDate(u.warrantyEndsOn)}</span>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <ActivityTimeline entityType="Commissioning" entityId={report.id} />
        </div>

        <div className="space-y-6">
          <SectionCard title="Demonstration and approval" icon={BadgeCheck}>
            {editable ? (
              <AutoForm action={saveCommissioningDetails} submitLabel="Save" columns={1} compact fields={detailFields} />
            ) : (
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-slate-400">Customer demonstration</dt>
                  <dd className="text-slate-800">{report.customerDemoDone ? "Given" : "Not recorded"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Approved by</dt>
                  <dd className="text-slate-800">
                    {report.customerApprovedBy
                      ? `${report.customerApprovedBy}${report.customerApprovedAt ? ` · ${formatDateTime(report.customerApprovedAt)}` : ""}`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-400">Engineer remarks</dt>
                  <dd className="whitespace-pre-line text-slate-800">{report.engineerRemarks || "—"}</dd>
                </div>
              </dl>
            )}
          </SectionCard>

          {report.status === "COMPLETED" ? (
            <SectionCard title="Commissioned" icon={ShieldCheck}>
              <p className="text-sm text-slate-700">
                Completed on <span className="font-medium text-slate-900">{formatDate(report.commissionedOn)}</span>. The
                warranty clock started on this date.
              </p>
            </SectionCard>
          ) : (
            editable && (
              <SectionCard
                title="Complete commissioning"
                description="All checks must pass and the customer must approve"
                icon={Gauge}
              >
                <AutoForm
                  action={completeCommissioning}
                  submitLabel="Complete and start warranty"
                  pendingLabel="Completing…"
                  columns={1}
                  compact
                  fields={[
                    { kind: "hidden", name: "commissioningId", value: report.id },
                    {
                      name: "commissionedOn",
                      label: "Commissioned on",
                      kind: "date",
                      defaultValue: toDateInput(todayDate),
                      hint: "Warranty is counted from this date.",
                    },
                  ]}
                />
              </SectionCard>
            )
          )}
        </div>
      </div>
    </div>
  );
}
