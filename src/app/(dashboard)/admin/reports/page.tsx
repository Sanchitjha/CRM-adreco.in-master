import { redirect } from "next/navigation";
import { BarChart3, Contact, TrendingUp, CircleX, Users, Timer, Activity } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DEPARTMENT_PIPELINE } from "@/lib/rbac";
import { PageHeader, StatCard, SectionCard, EmptyState } from "@/components/ui";

export default async function AdminReportsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const [totalLeads, statusCounts, salesReps, completedStages, activity] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.findMany({
      where: { role: "SALES" },
      include: { leadsAssigned: { select: { status: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.leadDepartmentHistory.findMany({
      where: { status: "COMPLETED", completedAt: { not: null } },
      include: { department: true },
    }),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { user: true },
    }),
  ]);

  const converted = statusCounts.find((s) => s.status === "CONVERTED")?._count._all ?? 0;
  const lost = statusCounts.find((s) => s.status === "LOST")?._count._all ?? 0;
  const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100) : 0;

  const repStats = salesReps
    .map((rep) => ({
      name: rep.name,
      total: rep.leadsAssigned.length,
      converted: rep.leadsAssigned.filter((l) => l.status === "CONVERTED").length,
    }))
    .sort((a, b) => b.converted - a.converted);

  const daysByDept = new Map<string, number[]>();
  for (const stage of completedStages) {
    const days = (stage.completedAt!.getTime() - stage.enteredAt.getTime()) / (1000 * 60 * 60 * 24);
    const arr = daysByDept.get(stage.department.name) ?? [];
    arr.push(days);
    daysByDept.set(stage.department.name, arr);
  }
  const turnaround = DEPARTMENT_PIPELINE.map((name) => {
    const days = daysByDept.get(name) ?? [];
    const avg = days.length ? days.reduce((a, b) => a + b, 0) / days.length : null;
    return { name, avgDays: avg, count: days.length };
  });

  return (
    <div className="space-y-6">
      <PageHeader icon={BarChart3} title="Reports" description="Pipeline health, team performance and workflow throughput." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total leads" value={totalLeads} icon={Contact} accent="brand" />
        <StatCard label="Converted" value={converted} icon={TrendingUp} accent="emerald" />
        <StatCard label="Conversion rate" value={`${conversionRate}%`} icon={TrendingUp} accent="violet" />
        <StatCard label="Lost" value={lost} icon={CircleX} accent="rose" />
      </div>

      <SectionCard title="Sales rep performance" description="Leads owned and converted" icon={Users} bodyClassName="p-0">
        {repStats.length === 0 ? (
          <EmptyState icon={Users} title="No sales reps yet" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-slate-50/70 text-left">
                  <th className="px-5 py-3 font-medium text-slate-500">Rep</th>
                  <th className="px-5 py-3 font-medium text-slate-500">Leads</th>
                  <th className="px-5 py-3 font-medium text-slate-500">Converted</th>
                  <th className="px-5 py-3 font-medium text-slate-500">Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {repStats.map((r) => {
                  const rate = r.total > 0 ? Math.round((r.converted / r.total) * 100) : 0;
                  return (
                    <tr key={r.name} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-medium text-slate-800">{r.name}</td>
                      <td className="px-5 py-3 tabular-nums text-slate-600">{r.total}</td>
                      <td className="px-5 py-3 tabular-nums text-slate-600">{r.converted}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-brand-500" style={{ width: `${rate}%` }} />
                          </div>
                          <span className="tabular-nums text-xs text-slate-500">{r.total > 0 ? `${rate}%` : "—"}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Department turnaround"
        description="Average days to complete each pipeline stage"
        icon={Timer}
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50/70 text-left">
                <th className="px-5 py-3 font-medium text-slate-500">Department</th>
                <th className="px-5 py-3 font-medium text-slate-500">Avg days</th>
                <th className="px-5 py-3 font-medium text-slate-500">Completed leads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {turnaround.map((t) => (
                <tr key={t.name} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-medium text-slate-800">{t.name}</td>
                  <td className="px-5 py-3 tabular-nums text-slate-600">
                    {t.avgDays !== null ? t.avgDays.toFixed(1) : "—"}
                  </td>
                  <td className="px-5 py-3 tabular-nums text-slate-600">{t.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Recent activity" description="Latest changes across the CRM" icon={Activity} bodyClassName="p-0">
        {activity.length === 0 ? (
          <EmptyState icon={Activity} title="No activity yet" />
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="text-slate-600">
                  <span className="font-medium text-slate-800">{a.user.name}</span>{" "}
                  {a.action.replace(/_/g, " ").toLowerCase()} · <span className="text-slate-400">{a.entityType}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-400">{a.createdAt.toLocaleString("en-IN")}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
