import Link from "next/link";
import { endOfDay } from "date-fns";
import {
  Contact,
  Waypoints,
  CircleCheckBig,
  CalendarClock,
  ClipboardList,
  Inbox,
  ArrowRight,
  ListChecks,
  Sparkles,
} from "lucide-react";
import type { LeadStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ROLE_LABELS, ROLE_TO_DEPARTMENT_NAME } from "@/lib/rbac";
import { STATUS_LABELS } from "@/components/status-badge";
import { StatCard, SectionCard, EmptyState, Badge } from "@/components/ui";
import { formatINR } from "@/lib/utils";
import { ZohoChatAction } from "@/components/zoho/zoho-chat-modal";
import { LifecycleStatsRow } from "@/components/lifecycle-stats-row";
import { lifecycleStats } from "@/lib/lifecycle-stats";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function DueBadge({ overdue, label }: { overdue: boolean; label: string }) {
  return <Badge tone={overdue ? "danger" : "warning"}>{label}</Badge>;
}

export default async function DashboardHome() {
  const session = await auth();
  const { role, id: userId } = session!.user;
  const firstName = session!.user.name?.split(" ")[0] ?? "there";
  const todayEnd = endOfDay(new Date());
  const now = new Date();

  const [stats, myTasks, myOpenTasks] = await Promise.all([
    lifecycleStats(role, userId),
    prisma.task.findMany({
      where: { assignedToId: userId, status: { not: "DONE" }, dueDate: { lte: todayEnd } },
      orderBy: { dueDate: "asc" },
      include: { lead: true },
    }),
    prisma.task.count({ where: { assignedToId: userId, status: { not: "DONE" } } }),
  ]);

  const header = (
    <div>
      <p className="text-sm font-medium text-brand-600">{greeting()},</p>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{firstName}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {ROLE_LABELS[role]} ·{" "}
        {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
      </p>
    </div>
  );

  const tasksWidget = (
    <SectionCard title="Your tasks" description="Due today or overdue" icon={ClipboardList} bodyClassName="p-0">
      {myTasks.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nothing due right now" description="You're on top of your tasks." />
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {myTasks.map((task) => {
            const overdue = !!task.dueDate && task.dueDate < now;
            return (
              <li key={task.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{task.title}</p>
                  {task.lead && <p className="truncate text-xs text-slate-400">{task.lead.customerName}</p>}
                </div>
                <DueBadge overdue={overdue} label={overdue ? "Overdue" : "Due today"} />
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );

  /* ------------------------------------------------ Department / field roles */
  if (role !== "ADMIN" && role !== "SALES") {
    const departmentName = ROLE_TO_DEPARTMENT_NAME[role];
    const department = departmentName
      ? await prisma.department.findUnique({ where: { name: departmentName } })
      : null;
    const queueCount = department
      ? await prisma.lead.count({ where: { currentDepartmentId: department.id } })
      : 0;

    return (
      <div className="space-y-6">
        {header}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard label="In your queue" value={queueCount} icon={Inbox} accent="brand" href="/queue" />
          <StatCard label="Tasks due / overdue" value={myTasks.length} icon={CalendarClock} accent="amber" href="/tasks" />
          <StatCard label="Open tasks" value={myOpenTasks} icon={ClipboardList} accent="slate" href="/tasks" />
        </div>
        <LifecycleStatsRow stats={stats} />
        <div className="grid gap-5 lg:grid-cols-2">
          <SectionCard
            title={`${departmentName} queue`}
            description="Leads waiting on your team"
            icon={Inbox}
            action={
              <Link href="/queue" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
                Open <ArrowRight className="size-4" />
              </Link>
            }
          >
            {queueCount === 0 ? (
              <p className="text-sm text-slate-400">Nothing in your queue right now.</p>
            ) : (
              <p className="text-sm text-slate-600">
                <span className="text-2xl font-semibold text-slate-900">{queueCount}</span> lead
                {queueCount === 1 ? "" : "s"} waiting for {departmentName}.
              </p>
            )}
          </SectionCard>
          {tasksWidget}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------- Admin / sales rep */
  const leadWhere = role === "ADMIN" ? {} : { assignedToId: userId };

  const [statusCounts, openLeads] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], where: leadWhere, _count: { _all: true } }),
    prisma.lead.findMany({
      where: { ...leadWhere, status: { notIn: ["CONVERTED", "LOST"] } },
      include: { followUps: { orderBy: { followUpDate: "desc" }, take: 1 }, assignedTo: true },
    }),
  ]);

  const countByStatus = new Map(statusCounts.map((s) => [s.status, s._count._all]));
  const count = (s: LeadStatus) => countByStatus.get(s) ?? 0;
  const total = statusCounts.reduce((sum, s) => sum + s._count._all, 0);
  const openCount = count("NEW") + count("CONTACTED") + count("FOLLOW_UP") + count("QUOTED");
  const converted = count("CONVERTED");
  const closed = converted + count("LOST");
  const conversionRate = closed > 0 ? Math.round((converted / closed) * 100) : 0;

  const dueOrOverdue = openLeads
    .filter((lead) => {
      const next = lead.followUps[0]?.nextFollowUpDate;
      return next && next <= todayEnd;
    })
    .sort(
      (a, b) => a.followUps[0]!.nextFollowUpDate!.getTime() - b.followUps[0]!.nextFollowUpDate!.getTime(),
    );

  const neverContacted = openLeads.filter((lead) => lead.followUps.length === 0);

  const funnel: { status: LeadStatus; tone: string }[] = [
    { status: "NEW", tone: "bg-slate-400" },
    { status: "CONTACTED", tone: "bg-sky-500" },
    { status: "FOLLOW_UP", tone: "bg-amber-500" },
    { status: "QUOTED", tone: "bg-violet-500" },
    { status: "CONVERTED", tone: "bg-emerald-500" },
  ];
  const funnelMax = Math.max(1, ...funnel.map((f) => count(f.status)));

  const activePipelineBudget = openLeads.reduce(
    (sum, l) => (l.budget ? sum + Number(l.budget) : sum),
    0,
  );

  return (
    <div className="space-y-6">
      {header}

      {/* AI Sales Copilot Briefing Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-200/80 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 text-white shadow-md">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/20 text-brand-300 ring-1 ring-brand-400/30">
              <Sparkles className="size-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-brand-300">
                  AI Sales Copilot & Omnichannel Hub
                </span>
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                  Active
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-slate-200">
                You have <span className="font-bold text-white">{openCount} active deals</span> in pipeline valued at{" "}
                <span className="font-bold text-emerald-400">{formatINR(activePipelineBudget)}</span>.{" "}
                {dueOrOverdue.length > 0
                  ? `${dueOrOverdue.length} follow-up${dueOrOverdue.length === 1 ? " is" : "s are"} due for immediate outreach.`
                  : "All follow-ups are up to date."}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href="/leads" className="btn btn-primary btn-sm bg-brand-500 hover:bg-brand-600 text-white">
              Open pipeline board
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total leads" value={total} icon={Contact} accent="brand" href="/leads" />
        <StatCard label="Open pipeline" value={openCount} icon={Waypoints} accent="violet" href="/leads" hint="Not yet converted or lost" />
        <StatCard label="Converted" value={converted} icon={CircleCheckBig} accent="emerald" hint={`${conversionRate}% win rate`} />
        <StatCard label="Follow-ups due" value={dueOrOverdue.length} icon={CalendarClock} accent="amber" hint="Due today or overdue" />
      </div>

      <LifecycleStatsRow stats={stats} />

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="Sales funnel" description="Leads by stage" icon={Waypoints} className="lg:col-span-2">
          <div className="space-y-3.5">
            {funnel.map((f) => {
              const c = count(f.status);
              const pct = Math.round((c / funnelMax) * 100);
              return (
                <div key={f.status}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-600">{STATUS_LABELS[f.status]}</span>
                    <span className="tabular-nums font-semibold text-slate-900">{c}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${f.tone}`} style={{ width: `${Math.max(pct, c > 0 ? 4 : 0)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm">
            <span className="text-slate-500">Lost</span>
            <span className="tabular-nums font-semibold text-rose-600">{count("LOST")}</span>
          </div>
        </SectionCard>

        {tasksWidget}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard
          title="Follow-ups due"
          description="Leads needing a touch"
          icon={CalendarClock}
          className="lg:col-span-2"
          bodyClassName="p-0"
        >
          {dueOrOverdue.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No follow-ups due" description="Nothing needs chasing right now." />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {dueOrOverdue.map((lead) => {
                const next = lead.followUps[0]!.nextFollowUpDate!;
                const overdue = next < now;
                return (
                  <li key={lead.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <Link href={`/leads/${lead.id}`} className="truncate text-sm font-medium text-slate-800 hover:text-brand-600">
                        {lead.customerName}
                      </Link>
                      {role === "ADMIN" && lead.assignedTo && (
                        <p className="truncate text-xs text-slate-400">{lead.assignedTo.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <ZohoChatAction
                        customerName={lead.customerName}
                        phone={lead.phone}
                        leadId={lead.id}
                        productCategory={lead.productCategory}
                        budget={lead.budget ? Number(lead.budget) : null}
                        variant="icon"
                      />
                      <DueBadge overdue={overdue} label={`${overdue ? "Overdue" : "Due"} · ${next.toLocaleDateString("en-IN")}`} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Awaiting first contact" description="New leads never touched" icon={Contact} bodyClassName="p-0">
          {neverContacted.length === 0 ? (
            <EmptyState icon={Inbox} title="All leads contacted" />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {neverContacted.slice(0, 6).map((lead) => (
                <li key={lead.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link href={`/leads/${lead.id}`} className="truncate text-sm font-medium text-slate-800 hover:text-brand-600">
                      {lead.customerName}
                    </Link>
                    <p className="truncate text-xs text-slate-400">{lead.createdAt.toLocaleDateString("en-IN")}</p>
                  </div>
                  <ZohoChatAction
                    customerName={lead.customerName}
                    phone={lead.phone}
                    leadId={lead.id}
                    productCategory={lead.productCategory}
                    budget={lead.budget ? Number(lead.budget) : null}
                    variant="small"
                    label="Zoho Chat"
                  />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
