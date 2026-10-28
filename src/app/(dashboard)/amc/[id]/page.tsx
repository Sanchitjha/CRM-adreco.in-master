import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BellRing, CalendarCheck, CalendarClock, GitBranch, ScanBarcode } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canView } from "@/lib/rbac";
import { canSeeLead } from "@/lib/scope";
import { fieldTechnicians } from "@/lib/people";
import { formatDate, toDateInput, today } from "@/lib/dates";
import { amcState, daysBetween, renewalBucket, warrantyState } from "@/lib/lifecycle";
import { AMC_STATE, AMC_VISIT_STATUS, WARRANTY_STATE } from "@/lib/statuses";
import { formatINR } from "@/lib/utils";
import { Avatar, SectionCard } from "@/components/ui";
import { ActivityTimeline, BackLink, CustomerLink, InfoGrid, StatusPill } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { ActionButton } from "@/components/action-forms";
import { cancelAmc, completeVisit, renewAmc, rescheduleVisit, skipVisit } from "../actions";

export default async function AmcDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!canView(user.role, "amc")) redirect("/");

  const contract = await prisma.amcContract.findUnique({
    where: { id },
    include: {
      lead: true,
      createdBy: true,
      renewedFrom: true,
      renewals: true,
      units: { include: { serialNumber: { include: { product: true } } } },
      visits: { orderBy: { scheduledFor: "asc" }, include: { technician: true } },
    },
  });
  if (!contract) notFound();
  if (!canSeeLead(user.role, user.id, contract.lead)) notFound();

  const manage = canManage(user.role, "amc");
  const technicians = manage ? await fieldTechnicians() : [];
  const todayDate = today();
  const state = amcState(contract, todayDate);
  const bucket = contract.status === "ACTIVE" ? renewalBucket(contract.endDate, todayDate) : null;
  const renewed = contract.renewals.length > 0;
  const live = contract.status === "ACTIVE";

  const done = contract.visits.filter((v) => v.status === "COMPLETED").length;

  return (
    <div className="space-y-6">
      <BackLink href="/amc" label="Back to AMC contracts" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={contract.lead.customerName} className="size-12 text-base" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{contract.contractNumber}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              <CustomerLink role={user.role} leadId={contract.lead.id} name={contract.lead.customerName} /> ·{" "}
              {formatDate(contract.startDate)} – {formatDate(contract.endDate)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill meta={AMC_STATE[state]} />
          {manage && live && !renewed && (
            <ActionButton
              action={renewAmc}
              hidden={{ amcId: contract.id }}
              label="Renew contract"
              pendingLabel="Renewing…"
              variant={bucket || state === "EXPIRED" ? "primary" : "secondary"}
            />
          )}
          {manage && live && (
            <ActionButton
              action={cancelAmc}
              hidden={{ amcId: contract.id }}
              label="Cancel contract"
              variant="ghost"
              confirm="Cancel this contract? Its remaining scheduled visits will be skipped."
            />
          )}
        </div>
      </div>

      {live && !renewed && (bucket || state === "EXPIRED") && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <BellRing className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {state === "EXPIRED"
                ? `This contract ended on ${formatDate(contract.endDate)} and has not been renewed.`
                : `Renewal due — ${daysBetween(todayDate, contract.endDate)} days left (inside the ${bucket}-day window).`}
            </p>
            <p className="text-xs text-slate-500">Renewing starts the next term the day after this one ends, on the same terms.</p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard
            title="Preventive maintenance visits"
            description={`${done} of ${contract.visits.length} completed`}
            icon={CalendarCheck}
            bodyClassName="p-0"
          >
            {contract.visits.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">No visits scheduled.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {contract.visits.map((v) => {
                  const overdue = v.status === "SCHEDULED" && v.scheduledFor.getTime() < todayDate.getTime();
                  const mayAct = live && v.status === "SCHEDULED" && (manage || v.technicianId === user.id);
                  return (
                    <li key={v.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {formatDate(v.scheduledFor)}
                            {overdue && <span className="ml-2 text-xs font-semibold text-rose-600">Overdue</span>}
                          </p>
                          <p className="text-xs text-slate-400">
                            {v.status === "COMPLETED"
                              ? `Done ${formatDate(v.completedAt)}${v.technician ? ` by ${v.technician.name}` : ""}`
                              : (v.technician?.name ?? "No technician yet")}
                            {v.notes ? ` · ${v.notes}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusPill meta={AMC_VISIT_STATUS[v.status]} />
                          {mayAct && (
                            <ActionButton action={skipVisit} hidden={{ visitId: v.id }} label="Skip" variant="ghost" confirm="Skip this visit?" />
                          )}
                        </div>
                      </div>
                      {mayAct && (
                        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                          <details className="group">
                            <summary className="cursor-pointer text-sm font-medium text-brand-600 hover:text-brand-700">
                              Record visit
                            </summary>
                            <div className="mt-3 max-w-md rounded-lg border border-[var(--border)] bg-slate-50/60 p-4">
                              <AutoForm
                                action={completeVisit}
                                submitLabel="Mark visit done"
                                columns={1}
                                compact
                                fields={[
                                  { kind: "hidden", name: "visitId", value: v.id },
                                  ...(manage
                                    ? ([
                                        {
                                          kind: "select",
                                          name: "technicianId",
                                          label: "Technician",
                                          placeholder: "Select…",
                                          defaultValue: v.technicianId,
                                          options: technicians.map((t) => ({ value: t.id, label: t.name })),
                                        },
                                      ] as const)
                                    : []),
                                  { name: "notes", label: "Findings", kind: "textarea", rows: 2, placeholder: "Checks done, parts replaced, advice given" },
                                ]}
                              />
                            </div>
                          </details>
                          <details>
                            <summary className="cursor-pointer text-sm font-medium text-slate-500 hover:text-slate-700">Reschedule</summary>
                            <div className="mt-3 max-w-xs rounded-lg border border-[var(--border)] bg-slate-50/60 p-4">
                              <AutoForm
                                action={rescheduleVisit}
                                submitLabel="Move visit"
                                columns={1}
                                compact
                                fields={[
                                  { kind: "hidden", name: "visitId", value: v.id },
                                  { name: "scheduledFor", label: "New date", kind: "date", required: true, defaultValue: toDateInput(v.scheduledFor) },
                                ]}
                              />
                            </div>
                          </details>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Covered machines" icon={ScanBarcode} bodyClassName="p-0">
            <ul className="divide-y divide-[var(--border)]">
              {contract.units.map(({ serialNumber: u }) => (
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
                  <StatusPill meta={WARRANTY_STATE[warrantyState(u.warrantyEndsOn, todayDate)]} />
                </li>
              ))}
            </ul>
          </SectionCard>

          <ActivityTimeline entityType="AmcContract" entityId={contract.id} />
        </div>

        <div className="space-y-6">
          <SectionCard title="Contract" icon={CalendarClock}>
            <InfoGrid
              columns={1}
              items={[
                { label: "Amount", value: formatINR(Number(contract.amount)) },
                { label: "Visits per year", value: contract.visitsPerYear },
                { label: "Covered parts", value: contract.coveredParts },
                { label: "Notes", value: contract.notes },
                { label: "Created by", value: `${contract.createdBy.name} · ${formatDate(contract.createdAt)}` },
              ]}
            />
          </SectionCard>

          {(contract.renewedFrom || contract.renewals.length > 0) && (
            <SectionCard title="Renewals" icon={GitBranch}>
              <ul className="space-y-2 text-sm">
                {contract.renewedFrom && (
                  <li>
                    <span className="text-slate-400">Renews </span>
                    <Link href={`/amc/${contract.renewedFrom.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                      {contract.renewedFrom.contractNumber}
                    </Link>
                  </li>
                )}
                {contract.renewals.map((r) => (
                  <li key={r.id}>
                    <span className="text-slate-400">Renewed as </span>
                    <Link href={`/amc/${r.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                      {r.contractNumber}
                    </Link>
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
