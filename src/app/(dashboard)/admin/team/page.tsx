import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Contact, Mail, MessagesSquare, UserRoundX, UsersRound, UserRoundCheck, History } from "lucide-react";
import { auth } from "@/auth";
import { formatLongDate } from "@/lib/dates";
import { isReportKind, type LeadListItem, type ReportKind } from "@/lib/team-report";
import { loadTeamReport } from "@/lib/team-report-data";
import { PageHeader, SectionCard, StatCard } from "@/components/ui";
import { TeamActivityTable } from "@/components/admin/team-activity-table";
import { cn } from "@/lib/utils";

const TABS: { kind: ReportKind; label: string }[] = [
  { kind: "today", label: "Today" },
  { kind: "yesterday", label: "Yesterday" },
  { kind: "week", label: "Last 7 days" },
];

function LeadList({ title, items, icon }: { title: string; items: LeadListItem[]; icon: typeof Contact }) {
  if (items.length === 0) return null;
  return (
    <SectionCard title={title} icon={icon} bodyClassName="p-0">
      <ul className="divide-y divide-[var(--border)]">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <Link href={`/leads/${item.id}`} className="truncate text-sm font-medium text-slate-800 hover:text-brand-600">
                {item.customerName}
              </Link>
              <p className="truncate text-xs text-slate-400">{item.ownerName ?? "Unassigned"}</p>
            </div>
            <span className="shrink-0 text-xs text-slate-500">{item.note}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export default async function TeamActivityPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const { day } = await searchParams;
  const kind: ReportKind = isReportKind(day) ? day : "today";
  const report = await loadTeamReport(kind);
  const t = report.totals;

  const heading =
    kind === "week"
      ? `${formatLongDate(report.window.start)} to ${formatLongDate(report.window.end)}`
      : `${report.window.label}, ${formatLongDate(report.window.start)}`;

  const service: string[] = [];
  if (report.service.ticketsPastSla > 0) service.push(`${report.service.ticketsPastSla} service ticket(s) past their SLA`);
  if (report.service.visitsOverdue > 0) service.push(`${report.service.visitsOverdue} maintenance visit(s) overdue`);
  if (report.service.renewalsSoon > 0) service.push(`${report.service.renewalsSoon} AMC renewal(s) due within 30 days`);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UsersRound}
        title="Team activity"
        description={`${heading} · India time. The same update is emailed to administrators every morning.`}
      />

      <nav aria-label="Period" className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.kind}
            href={`/admin/team?day=${tab.kind}`}
            aria-current={tab.kind === kind ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-medium ring-1 ring-inset transition",
              tab.kind === kind
                ? "bg-brand-600 text-white ring-brand-600"
                : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard label="New leads" value={t.newLeads} icon={Contact} accent="brand" />
        <StatCard label="Follow-ups logged" value={t.followUps} icon={History} accent="violet" />
        <StatCard label="Customer messages" value={t.customerMessages} icon={Mail} accent="emerald" hint="Emails and WhatsApp" />
        <StatCard label="Team chat messages" value={t.chatMessages} icon={MessagesSquare} accent="slate" />
        <StatCard label="Overdue follow-ups" value={t.overdueFollowUps} icon={CalendarClock} accent="rose" />
        <StatCard label="No activity" value={t.idleCount} icon={t.idleCount > 0 ? UserRoundX : UserRoundCheck} accent={t.idleCount > 0 ? "amber" : "emerald"} />
      </div>

      <SectionCard
        title="What each person did"
        description="From the CRM's activity record and the team chat"
        icon={UsersRound}
        bodyClassName="p-0"
      >
        <TeamActivityTable report={report} />
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <LeadList title="Follow-ups overdue" items={report.lists.overdue} icon={CalendarClock} />
        <LeadList title="Leads not contacted yet" items={report.lists.neverContacted} icon={Contact} />
        <LeadList title="Leads untouched for a week" items={report.lists.stale} icon={History} />
        {service.length > 0 && (
          <SectionCard title="Service" icon={CalendarClock}>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {service.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    </div>
  );
}
