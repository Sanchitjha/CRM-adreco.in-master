import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, LifeBuoy, MapPin, Package, Phone, ShieldCheck, Timer, UserCheck, Wrench } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canView } from "@/lib/rbac";
import { canSeeLead } from "@/lib/scope";
import { fieldTechnicians } from "@/lib/people";
import { formatDate, formatDateTime, toDateInput, today } from "@/lib/dates";
import { isInWarranty, slaState, warrantyState } from "@/lib/lifecycle";
import { SLA_STATE, TICKET_PRIORITY, TICKET_STATUS, WARRANTY_STATE, statusOptions } from "@/lib/statuses";
import { TICKET_STATUS_VALUES } from "@/lib/validation/ticket";
import { cn } from "@/lib/utils";
import { Avatar, SectionCard } from "@/components/ui";
import { ActivityTimeline, BackLink, CustomerLink, InfoGrid, StatusPill } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { ActionButton, SelectActionForm } from "@/components/action-forms";
import { addTicketPart, assignTicket, checkInTicket, removeTicketPart, saveTicketNotes, updateTicketStatus } from "../actions";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!canView(user.role, "tickets")) redirect("/");

  const ticket = await prisma.serviceTicket.findUnique({
    where: { id },
    include: {
      lead: true,
      createdBy: true,
      assignedTo: true,
      serialNumber: { include: { product: true } },
      parts: { include: { product: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) notFound();
  if (!canSeeLead(user.role, user.id, ticket.lead)) notFound();

  const manage = canManage(user.role, "tickets");
  const operate = manage || ticket.assignedToId === user.id;
  const open = ticket.status !== "CLOSED";
  const now = new Date();
  const todayDate = today();
  const sla = slaState(ticket, now);

  const unit = ticket.serialNumber;
  const wState = unit ? warrantyState(unit.warrantyEndsOn, todayDate) : null;
  const covered = unit ? isInWarranty(unit.warrantyEndsOn, todayDate) : false;

  const [technicians, spareParts] = await Promise.all([
    manage ? fieldTechnicians() : Promise.resolve([]),
    operate && open
      ? prisma.product.findMany({
          where: { isSparePart: true, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, modelCode: true, stockQty: true },
        })
      : Promise.resolve([]),
  ]);

  const steps = TICKET_STATUS_VALUES;
  const stepIndex = steps.indexOf(ticket.status);

  return (
    <div className="space-y-6">
      <BackLink href="/tickets" label="Back to tickets" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={ticket.lead.customerName} className="size-12 text-base" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{ticket.ticketNumber}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              <CustomerLink role={user.role} leadId={ticket.lead.id} name={ticket.lead.customerName} /> · raised{" "}
              {formatDate(ticket.createdAt)} by {ticket.createdBy.name}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill meta={TICKET_PRIORITY[ticket.priority]} />
          <StatusPill meta={TICKET_STATUS[ticket.status]} />
          {sla && <StatusPill meta={SLA_STATE[sla]} />}
        </div>
      </div>

      {/* Workflow position */}
      <ol className="flex flex-wrap items-center gap-1.5 text-xs">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 font-medium ring-1 ring-inset",
                i < stepIndex && "bg-emerald-50 text-emerald-700 ring-emerald-200",
                i === stepIndex && "bg-brand-600 text-white ring-brand-600",
                i > stepIndex && "bg-white text-slate-400 ring-[var(--border-strong)]",
              )}
            >
              {TICKET_STATUS[s].label}
            </span>
            {i < steps.length - 1 && <span className="text-slate-300">→</span>}
          </li>
        ))}
      </ol>

      {unit && wState && (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
            covered ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/70",
          )}
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className={cn("mt-0.5 size-5 shrink-0", covered ? "text-emerald-600" : "text-amber-600")} />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {covered
                  ? `Under warranty until ${formatDate(unit.warrantyEndsOn)}`
                  : wState === "NOT_STARTED"
                    ? "Warranty has not started for this machine"
                    : `Out of warranty since ${formatDate(unit.warrantyEndsOn)}`}
              </p>
              <p className="text-xs text-slate-500">
                {covered
                  ? "Parts and repair for covered faults can be claimed under warranty."
                  : "Chargeable service — a good moment to offer an annual maintenance contract."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {covered && canManage(user.role, "warranty") && (
              <Link href={`/warranty/claims/new?serialId=${unit.id}&ticketId=${ticket.id}`} className="btn btn-secondary btn-sm">
                Raise warranty claim
              </Link>
            )}
            {!covered && canManage(user.role, "amc") && (
              <Link href={`/amc/new?leadId=${ticket.lead.id}`} className="btn btn-secondary btn-sm">
                Offer an AMC
              </Link>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Complaint" icon={LifeBuoy}>
            <h2 className="text-base font-semibold text-slate-900">{ticket.subject}</h2>
            {ticket.description && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{ticket.description}</p>}
            <div className="mt-5">
              <InfoGrid
                items={[
                  { label: "Complaint type", value: ticket.complaintType },
                  {
                    label: "Machine",
                    value: unit ? (
                      canView(user.role, "serials") ? (
                        <Link href={`/serial-numbers/${unit.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                          {unit.serialNo} · {unit.product.name}
                        </Link>
                      ) : (
                        `${unit.serialNo} · ${unit.product.name}`
                      )
                    ) : null,
                  },
                  {
                    label: "Customer contact",
                    value: (
                      <span className="inline-flex items-center gap-1.5">
                        <Phone className="size-3.5 text-slate-400" />
                        <a href={`tel:${ticket.lead.phone}`} className="hover:text-brand-600">
                          {ticket.lead.phone}
                        </a>
                      </span>
                    ),
                  },
                  {
                    label: "Site",
                    value: ticket.lead.address ? (
                      <span className="inline-flex items-start gap-1.5">
                        <MapPin className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                        {ticket.lead.address}
                      </span>
                    ) : null,
                  },
                  { label: "Visit scheduled", value: formatDate(ticket.visitScheduledFor) },
                  { label: "Checked in", value: ticket.checkedInAt ? formatDateTime(ticket.checkedInAt) : null },
                ]}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="Site visit"
            description="Check in on arrival, then record the diagnosis and the fix"
            icon={Wrench}
            action={
              operate && open ? (
                <ActionButton
                  action={checkInTicket}
                  hidden={{ ticketId: ticket.id }}
                  label={ticket.checkedInAt ? "Check in again" : "Check in at site"}
                  pendingLabel="Checking in…"
                  variant={ticket.checkedInAt ? "secondary" : "primary"}
                />
              ) : undefined
            }
          >
            {operate && open ? (
              <AutoForm
                action={saveTicketNotes}
                submitLabel="Save visit notes"
                columns={1}
                fields={[
                  { kind: "hidden", name: "ticketId", value: ticket.id },
                  { name: "diagnosis", label: "Diagnosis", kind: "textarea", rows: 3, defaultValue: ticket.diagnosis, placeholder: "What is wrong with the machine?" },
                  { name: "resolution", label: "Resolution", kind: "textarea", rows: 3, defaultValue: ticket.resolution, placeholder: "What was done to fix it? Needed before the ticket can be closed." },
                  { name: "visitScheduledFor", label: "Next visit date", kind: "date", defaultValue: toDateInput(ticket.visitScheduledFor) },
                  { name: "customerSignedOffBy", label: "Customer sign-off (name)", defaultValue: ticket.customerSignedOffBy, hint: "Who accepted the work on the customer's side." },
                ]}
              />
            ) : (
              <InfoGrid
                columns={1}
                items={[
                  { label: "Diagnosis", value: ticket.diagnosis },
                  { label: "Resolution", value: ticket.resolution },
                  { label: "Customer sign-off", value: ticket.customerSignedOffBy },
                ]}
              />
            )}
          </SectionCard>

          <SectionCard title="Spare parts used" description="Stock is deducted as parts are added" icon={Package} bodyClassName="p-0">
            {ticket.parts.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">No parts used on this ticket.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {ticket.parts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.product.name}</p>
                      <p className="text-xs text-slate-400">{p.product.modelCode}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm tabular-nums text-slate-700">× {p.quantity}</span>
                      {operate && open && (
                        <ActionButton
                          action={removeTicketPart}
                          hidden={{ partId: p.id }}
                          label="Remove"
                          variant="ghost"
                          confirm={`Remove ${p.product.name} and return ${p.quantity} to stock?`}
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {operate && open && (
              <div className="border-t border-[var(--border)] px-5 py-4">
                {spareParts.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No spare parts in the catalog yet. Add them under Products and mark them as spare parts.
                  </p>
                ) : (
                  <AutoForm
                    action={addTicketPart}
                    submitLabel="Add part"
                    columns={2}
                    compact
                    resetOnSuccess
                    fields={[
                      { kind: "hidden", name: "ticketId", value: ticket.id },
                      {
                        kind: "select",
                        name: "productId",
                        label: "Spare part",
                        required: true,
                        options: spareParts.map((p) => ({
                          value: p.id,
                          label: `${p.name} (${p.modelCode}) — ${p.stockQty} in stock`,
                        })),
                      },
                      { name: "quantity", label: "Quantity", kind: "number", min: 1, required: true, defaultValue: 1 },
                    ]}
                  />
                )}
              </div>
            )}
          </SectionCard>

          <ActivityTimeline entityType="ServiceTicket" entityId={ticket.id} />
        </div>

        <div className="space-y-6">
          {operate && (
            <SectionCard title="Progress" description="Assigned → visit → diagnosis → parts → repair → closed" icon={LifeBuoy}>
              <SelectActionForm
                action={updateTicketStatus}
                hidden={{ ticketId: ticket.id }}
                name="status"
                current={ticket.status}
                options={statusOptions(TICKET_STATUS)}
                notePlaceholder="Optional note for the history"
              />
            </SectionCard>
          )}

          <SectionCard title="Technician" icon={UserCheck}>
            <p className="text-sm text-slate-700">{ticket.assignedTo?.name ?? "Not assigned yet"}</p>
            {manage && open && (
              <div className="mt-3">
                <SelectActionForm
                  action={assignTicket}
                  hidden={{ ticketId: ticket.id }}
                  name="technicianId"
                  current={ticket.assignedToId}
                  placeholder="Choose technician…"
                  submitLabel="Assign"
                  options={technicians.map((t) => ({ value: t.id, label: t.name }))}
                />
              </div>
            )}
          </SectionCard>

          <SectionCard title="Service level" icon={Timer}>
            <InfoGrid
              columns={1}
              items={[
                { label: "Priority", value: TICKET_PRIORITY[ticket.priority].label },
                { label: "Resolve by", value: ticket.slaDueAt ? formatDateTime(ticket.slaDueAt) : null },
                { label: "Closed", value: ticket.closedAt ? formatDateTime(ticket.closedAt) : null },
              ]}
            />
          </SectionCard>

          {unit && (
            <SectionCard title="Machine warranty" icon={CalendarClock}>
              <div className="flex items-center gap-2">
                <StatusPill meta={WARRANTY_STATE[wState!]} />
                {unit.warrantyEndsOn && <span className="text-xs text-slate-400">till {formatDate(unit.warrantyEndsOn)}</span>}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
