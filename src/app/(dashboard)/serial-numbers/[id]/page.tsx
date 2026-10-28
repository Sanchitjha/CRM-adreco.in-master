import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, GitCommitVertical, LifeBuoy, ScanBarcode, ShieldCheck, Wrench } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canView } from "@/lib/rbac";
import { canSeeLead } from "@/lib/scope";
import { formatDate, toDateInput, today } from "@/lib/dates";
import { amcState, warrantyState } from "@/lib/lifecycle";
import { AMC_STATE, CLAIM_STATUS, SERIAL_STATUS, TICKET_STATUS, WARRANTY_STATE } from "@/lib/statuses";
import { SectionCard } from "@/components/ui";
import { ActivityTimeline, BackLink, CustomerLink, InfoGrid, StatusPill } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { ActionButton } from "@/components/action-forms";
import { toggleSerialScrapped, updateSerial } from "../actions";

function RecordLink({ show, href, children }: { show: boolean; href: string; children: React.ReactNode }) {
  return show ? (
    <Link href={href} className="font-medium text-slate-800 hover:text-brand-600">
      {children}
    </Link>
  ) : (
    <span className="font-medium text-slate-800">{children}</span>
  );
}

export default async function SerialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!canView(user.role, "serials")) redirect("/");

  const serial = await prisma.serialNumber.findUnique({
    where: { id },
    include: {
      product: true,
      lead: true,
      salesOrder: true,
      installation: true,
      tickets: { orderBy: { createdAt: "desc" } },
      claims: { orderBy: { createdAt: "desc" } },
      amcUnits: { include: { amc: true } },
    },
  });
  if (!serial) notFound();
  if (user.role === "SALES" && (!serial.lead || !canSeeLead(user.role, user.id, serial.lead))) notFound();

  const todayDate = today();
  const wState = warrantyState(serial.warrantyEndsOn, todayDate);
  const manage = canManage(user.role, "serials");
  const seeOrders = canView(user.role, "salesOrders");
  const seeInstalls = canView(user.role, "installations");
  const seeTickets = canView(user.role, "tickets");
  const seeWarranty = canView(user.role, "warranty");
  const seeAmc = canView(user.role, "amc");

  const trail: { label: string; date: Date | null; detail?: React.ReactNode }[] = [
    {
      label: serial.manufacturedOn ? "Manufactured" : "Registered",
      date: serial.manufacturedOn ?? serial.createdAt,
    },
    {
      label: "Dispatched",
      date: serial.dispatchedAt,
      detail: serial.salesOrder && (
        <RecordLink show={seeOrders} href={`/sales-orders/${serial.salesOrder.id}`}>
          Order {serial.salesOrder.orderNumber}
        </RecordLink>
      ),
    },
    {
      label: "Installed",
      date: serial.installedAt,
      detail: serial.installation && (
        <RecordLink show={seeInstalls} href={`/installations/${serial.installation.id}`}>
          Job {serial.installation.jobNumber}
        </RecordLink>
      ),
    },
    { label: "Commissioned", date: serial.commissionedAt },
    {
      label: "Warranty",
      date: serial.warrantyStartsOn,
      detail: serial.warrantyEndsOn ? `Runs until ${formatDate(serial.warrantyEndsOn)}` : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      <BackLink href="/serial-numbers" label="Back to serial numbers" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{serial.serialNo}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            <Link href={`/products/${serial.product.id}`} className="hover:text-brand-600">
              {serial.product.name}
            </Link>{" "}
            · {serial.product.modelCode}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill meta={SERIAL_STATUS[serial.status]} />
          <StatusPill meta={WARRANTY_STATE[wState]} />
          {manage && (serial.status === "IN_STOCK" || serial.status === "SCRAPPED") && (
            <ActionButton
              action={toggleSerialScrapped}
              hidden={{ serialId: serial.id }}
              label={serial.status === "IN_STOCK" ? "Scrap unit" : "Return to stock"}
              confirm={serial.status === "IN_STOCK" ? "Mark this unit as scrapped?" : undefined}
            />
          )}
          {seeTickets && serial.lead && serial.status !== "IN_STOCK" && serial.status !== "SCRAPPED" && (
            <Link
              href={`/tickets/new?leadId=${serial.lead.id}&serialId=${serial.id}`}
              className="btn btn-secondary btn-sm"
            >
              <LifeBuoy className="size-3.5" />
              Raise ticket
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Lifecycle" description="Manufacturing → dispatch → install → commissioning" icon={GitCommitVertical}>
            <ol className="relative space-y-5 pl-6">
              <span className="absolute bottom-1 left-[7px] top-1 w-px bg-[var(--border)]" aria-hidden />
              {trail.map((step) => (
                <li key={step.label} className="relative">
                  <span
                    className={`absolute -left-6 top-1 size-3.5 rounded-full ring-4 ring-white ${step.date ? "bg-emerald-500" : "bg-slate-300"}`}
                    aria-hidden
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-sm font-medium ${step.date ? "text-slate-800" : "text-slate-400"}`}>{step.label}</span>
                    <span className="text-xs text-slate-400">{step.date ? formatDate(step.date) : "Not yet"}</span>
                  </div>
                  {step.date && step.detail && <p className="mt-0.5 text-xs text-slate-500">{step.detail}</p>}
                </li>
              ))}
            </ol>
          </SectionCard>

          <SectionCard title="Service history" icon={LifeBuoy} bodyClassName="p-0">
            {serial.tickets.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">No service tickets for this unit.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {serial.tickets.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <RecordLink show={seeTickets} href={`/tickets/${t.id}`}>
                        {t.ticketNumber}
                      </RecordLink>
                      <p className="truncate text-xs text-slate-400">
                        {t.subject} · {formatDate(t.createdAt)}
                      </p>
                    </div>
                    <StatusPill meta={TICKET_STATUS[t.status]} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Warranty claims" icon={ShieldCheck} bodyClassName="p-0">
            {serial.claims.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">No warranty claims.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {serial.claims.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <RecordLink show={seeWarranty} href={`/warranty/claims/${c.id}`}>
                        {c.claimNumber}
                      </RecordLink>
                      <p className="truncate text-xs text-slate-400">
                        {c.issue} · {formatDate(c.createdAt)}
                      </p>
                    </div>
                    <StatusPill meta={CLAIM_STATUS[c.status]} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Maintenance contracts" icon={CalendarClock} bodyClassName="p-0">
            {serial.amcUnits.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">Not covered by an AMC.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {serial.amcUnits.map(({ amc }) => (
                  <li key={amc.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <RecordLink show={seeAmc} href={`/amc/${amc.id}`}>
                        {amc.contractNumber}
                      </RecordLink>
                      <p className="text-xs text-slate-400">
                        {formatDate(amc.startDate)} – {formatDate(amc.endDate)}
                      </p>
                    </div>
                    <StatusPill meta={AMC_STATE[amcState(amc, todayDate)]} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <ActivityTimeline entityType="SerialNumber" entityId={serial.id} />
        </div>

        <div className="space-y-6">
          <SectionCard title="Unit details" icon={ScanBarcode}>
            <InfoGrid
              columns={1}
              items={[
                {
                  label: "Customer",
                  value: serial.lead ? <CustomerLink role={user.role} leadId={serial.lead.id} name={serial.lead.customerName} /> : null,
                },
                { label: "Site", value: serial.lead?.address },
                {
                  label: "Sales order",
                  value: serial.salesOrder && (
                    <RecordLink show={seeOrders} href={`/sales-orders/${serial.salesOrder.id}`}>
                      {serial.salesOrder.orderNumber}
                    </RecordLink>
                  ),
                },
                {
                  label: "Installation",
                  value: serial.installation && (
                    <RecordLink show={seeInstalls} href={`/installations/${serial.installation.id}`}>
                      {serial.installation.jobNumber}
                    </RecordLink>
                  ),
                },
                { label: "Warranty period", value: `${serial.product.warrantyMonths} months from commissioning` },
              ]}
            />
          </SectionCard>

          {manage && (
            <SectionCard title="Edit" icon={Wrench}>
              <AutoForm
                action={updateSerial}
                submitLabel="Save"
                columns={1}
                compact
                fields={[
                  { kind: "hidden", name: "serialId", value: serial.id },
                  { name: "manufacturedOn", label: "Manufactured on", kind: "date", defaultValue: toDateInput(serial.manufacturedOn) },
                  { name: "notes", label: "Notes", kind: "textarea", defaultValue: serial.notes },
                ]}
              />
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
