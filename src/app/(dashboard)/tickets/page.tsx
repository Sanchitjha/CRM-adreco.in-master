import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma, TicketPriority } from "@prisma/client";
import { AlertTriangle, CircleDot, LifeBuoy, Plus, Search, UserX } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { FIELD_ROLES, canCreate, canView } from "@/lib/rbac";
import { leadScope } from "@/lib/scope";
import { formatDate } from "@/lib/dates";
import { slaState } from "@/lib/lifecycle";
import { SLA_STATE, TICKET_PRIORITY, TICKET_STATUS } from "@/lib/statuses";
import { EmptyState, PageHeader, StatCard } from "@/components/ui";
import { CustomerLink, DataTable, FilterTabs, StatusPill } from "@/components/page-kit";

type SearchParams = { q?: string; view?: string; priority?: string };

const VIEWS = ["open", "mine", "breached", "unassigned", "closed", "all"] as const;
type View = (typeof VIEWS)[number];

export default async function TicketsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  if (!canView(user.role, "tickets")) redirect("/");

  const params = await searchParams;
  const q = params.q ?? "";
  const view: View = (VIEWS as readonly string[]).includes(params.view ?? "") ? (params.view as View) : "open";
  const priority = params.priority && params.priority in TICKET_PRIORITY ? (params.priority as TicketPriority) : undefined;
  const scope = leadScope(user.role, user.id);
  const now = new Date();

  const base: Prisma.ServiceTicketWhereInput = { lead: scope };
  const viewWhere: Record<View, Prisma.ServiceTicketWhereInput> = {
    open: { status: { not: "CLOSED" } },
    mine: { assignedToId: user.id, status: { not: "CLOSED" } },
    breached: { status: { not: "CLOSED" }, slaDueAt: { lt: now } },
    unassigned: { status: { not: "CLOSED" }, assignedToId: null },
    closed: { status: "CLOSED" },
    all: {},
  };

  const where: Prisma.ServiceTicketWhereInput = {
    ...base,
    ...viewWhere[view],
    ...(priority ? { priority } : {}),
    ...(q
      ? {
          OR: [
            { ticketNumber: { contains: q, mode: "insensitive" } },
            { subject: { contains: q, mode: "insensitive" } },
            { lead: { customerName: { contains: q, mode: "insensitive" } } },
            { serialNumber: { serialNo: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [tickets, counts] = await Promise.all([
    prisma.serviceTicket.findMany({
      where,
      include: { lead: true, serialNumber: true, assignedTo: true },
      orderBy: [{ slaDueAt: "asc" }, { createdAt: "desc" }],
    }),
    Promise.all(
      VIEWS.map((v) => prisma.serviceTicket.count({ where: { ...base, ...viewWhere[v] } })),
    ),
  ]);
  const countOf = (v: View) => counts[VIEWS.indexOf(v)];

  const label: Record<View, string> = {
    open: "Open",
    mine: "Assigned to me",
    breached: "SLA breached",
    unassigned: "Unassigned",
    closed: "Closed",
    all: "All",
  };
  const href = (v: View) =>
    `/tickets?${new URLSearchParams({ view: v, ...(q ? { q } : {}), ...(priority ? { priority } : {}) })}`;
  const visibleViews = VIEWS.filter((v) => v !== "mine" || FIELD_ROLES.includes(user.role));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LifeBuoy}
        title="Service tickets"
        description="From complaint to closed, with the technician in the field."
        actions={
          canCreate(user.role, "tickets") ? (
            <Link href="/tickets/new" className="btn btn-primary">
              <Plus className="size-4" />
              New ticket
            </Link>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Open tickets" value={countOf("open")} icon={CircleDot} accent="brand" href={href("open")} />
        <StatCard
          label="SLA breached"
          value={countOf("breached")}
          icon={AlertTriangle}
          accent="rose"
          href={href("breached")}
          hint="Open and past their resolution time"
        />
        <StatCard label="Unassigned" value={countOf("unassigned")} icon={UserX} accent="amber" href={href("unassigned")} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterTabs
          items={visibleViews.map((v) => ({ label: label[v], href: href(v), active: view === v, count: countOf(v) }))}
        />
        <form action="/tickets" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="view" value={view} />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input name="q" defaultValue={q} placeholder="Search ticket, customer or serial" className="input w-64 pl-9" />
          </div>
          <select name="priority" defaultValue={priority ?? ""} className="select w-auto">
            <option value="">Any priority</option>
            {(Object.keys(TICKET_PRIORITY) as TicketPriority[]).map((p) => (
              <option key={p} value={p}>
                {TICKET_PRIORITY[p].label}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
        </form>
      </div>

      <DataTable
        rows={tickets}
        rowKey={(t) => t.id}
        empty={
          <EmptyState
            icon={LifeBuoy}
            title={q || priority ? "No tickets match these filters" : "No tickets here"}
            description="Raise a ticket when a customer reports a problem with a machine."
          />
        }
        columns={[
          {
            header: "Ticket",
            cell: (t) => (
              <div>
                <Link href={`/tickets/${t.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                  {t.ticketNumber}
                </Link>
                <p className="line-clamp-1 max-w-56 text-xs text-slate-400">{t.subject}</p>
              </div>
            ),
          },
          { header: "Customer", cell: (t) => <CustomerLink role={user.role} leadId={t.lead.id} name={t.lead.customerName} /> },
          { header: "Machine", cell: (t) => t.serialNumber?.serialNo ?? <span className="text-slate-400">—</span> },
          { header: "Priority", cell: (t) => <StatusPill meta={TICKET_PRIORITY[t.priority]} /> },
          { header: "Status", cell: (t) => <StatusPill meta={TICKET_STATUS[t.status]} /> },
          {
            header: "SLA",
            cell: (t) => {
              const state = slaState(t, now);
              return state ? (
                <div>
                  <StatusPill meta={SLA_STATE[state]} />
                  {t.slaDueAt && state !== "MET" && <p className="mt-0.5 text-xs text-slate-400">by {formatDate(t.slaDueAt)}</p>}
                </div>
              ) : (
                "—"
              );
            },
          },
          { header: "Technician", cell: (t) => t.assignedTo?.name ?? <span className="text-slate-400">Unassigned</span> },
          { header: "Raised", align: "right", cell: (t) => <span className="text-slate-400">{formatDate(t.createdAt)}</span> },
        ]}
      />
    </div>
  );
}
