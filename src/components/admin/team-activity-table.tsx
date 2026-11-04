import { Badge } from "@/components/ui";
import { formatDateTime, formatTime } from "@/lib/dates";
import type { TeamReport } from "@/lib/team-report";

/** One row per employee: what they did, when they last did something, and what is overdue for them. */
export function TeamActivityTable({ report }: { report: TeamReport }) {
  const week = report.window.kind === "week";

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-slate-50/70 text-left">
            <th className="px-5 py-3 font-medium text-slate-500">Person</th>
            <th className="px-5 py-3 font-medium text-slate-500">What they did</th>
            <th className="px-5 py-3 font-medium text-slate-500">Last activity</th>
            <th className="px-5 py-3 text-center font-medium text-slate-500">Overdue follow-ups</th>
            <th className="px-5 py-3 text-center font-medium text-slate-500">Overdue tasks</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {report.employees.map((e) => (
            <tr key={e.userId} className="align-top hover:bg-slate-50/70">
              <td className="px-5 py-3">
                <p className="font-medium text-slate-800">{e.name}</p>
                <p className="text-xs text-slate-400">{e.roleLabel}</p>
              </td>
              <td className="px-5 py-3">
                {e.idle ? (
                  <Badge tone="danger">No activity</Badge>
                ) : (
                  <>
                    <p className="text-slate-700">{e.summary || "Chat only"}</p>
                    {e.chatMessages > 0 && (
                      <p className="text-xs text-slate-400">
                        {e.chatMessages} chat message{e.chatMessages === 1 ? "" : "s"}
                      </p>
                    )}
                  </>
                )}
              </td>
              <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                {e.lastActivityAt ? (week ? formatDateTime(e.lastActivityAt) : formatTime(e.lastActivityAt)) : "—"}
              </td>
              <td className="px-5 py-3 text-center">
                <span className={e.overdueFollowUps > 0 ? "font-semibold text-rose-600" : "text-slate-400"}>
                  {e.overdueFollowUps}
                </span>
              </td>
              <td className="px-5 py-3 text-center">
                <span className={e.overdueTasks > 0 ? "font-semibold text-rose-600" : "text-slate-400"}>
                  {e.overdueTasks}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
