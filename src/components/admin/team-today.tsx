import Link from "next/link";
import { ArrowRight, UsersRound } from "lucide-react";
import { loadTeamReport } from "@/lib/team-report-data";
import { EmptyState, SectionCard } from "@/components/ui";
import { TeamActivityTable } from "@/components/admin/team-activity-table";

/** The admin dashboard's view of what the team has done so far today. */
export async function TeamToday() {
  const report = await loadTeamReport("today");
  const t = report.totals;

  return (
    <SectionCard
      title="Team today"
      description="What each person has done so far today (India time)"
      icon={UsersRound}
      bodyClassName="p-0"
      action={
        <Link href="/admin/team" className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
          Full report <ArrowRight className="size-4" />
        </Link>
      }
    >
      {report.employees.length === 0 ? (
        <EmptyState icon={UsersRound} title="No employee accounts yet" />
      ) : (
        <>
          <TeamActivityTable report={report} />
          <p className="border-t border-[var(--border)] px-5 py-3 text-xs text-slate-400">
            So far today: {t.newLeads} new lead{t.newLeads === 1 ? "" : "s"}, {t.followUps} follow-up
            {t.followUps === 1 ? "" : "s"} logged, {t.customerMessages} message{t.customerMessages === 1 ? "" : "s"} or
            email{t.customerMessages === 1 ? "" : "s"} to customers. {t.idleCount} of {report.employees.length} people
            have no activity yet.
          </p>
        </>
      )}
    </SectionCard>
  );
}
