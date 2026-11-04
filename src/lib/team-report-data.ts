import { prisma } from "@/lib/db";
import { daysSince, formatDate, today } from "@/lib/dates";
import { addDaysUtc } from "@/lib/lifecycle";
import { buildTeamReport, reportWindow, type LeadListItem, type ReportKind, type TeamReport } from "@/lib/team-report";

/** A lead with no contact for this many days counts as untouched. */
const STALE_DAYS = 7;
/** A new lead nobody has contacted within this many days is flagged. */
const FIRST_CONTACT_DAYS = 1;
const LIST_LIMIT = 8;

/** Everything the daily update needs, read from the database for the chosen day (or week). */
export async function loadTeamReport(kind: ReportKind, now: Date = new Date()): Promise<TeamReport> {
  const window = reportWindow(kind, now);
  const todayDate = today(now);

  const [users, activity, chat, newLeads, openLeads, overdueTasks, ticketsPastSla, visitsOverdue, renewalsSoon] =
    await Promise.all([
      prisma.user.findMany({
        where: { active: true, role: { not: "ADMIN" } },
        select: { id: true, name: true, role: true },
      }),
      prisma.activityLog.groupBy({
        by: ["userId", "action"],
        where: { createdAt: { gte: window.start, lt: window.end } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.chatMessage.groupBy({
        by: ["authorId"],
        where: { createdAt: { gte: window.start, lt: window.end } },
        _count: { _all: true },
      }),
      prisma.lead.count({ where: { createdAt: { gte: window.start, lt: window.end } } }),
      prisma.lead.findMany({
        where: { status: { notIn: ["CONVERTED", "LOST"] } },
        select: {
          id: true,
          customerName: true,
          createdAt: true,
          assignedToId: true,
          assignedTo: { select: { name: true } },
          followUps: {
            orderBy: { followUpDate: "desc" },
            take: 1,
            select: { followUpDate: true, nextFollowUpDate: true },
          },
        },
      }),
      prisma.task.groupBy({
        by: ["assignedToId"],
        where: { status: { not: "DONE" }, dueDate: { lt: todayDate } },
        _count: { _all: true },
      }),
      prisma.serviceTicket.count({ where: { status: { not: "CLOSED" }, slaDueAt: { lt: now } } }),
      prisma.amcVisit.count({
        where: { status: "SCHEDULED", scheduledFor: { lte: todayDate }, amc: { status: "ACTIVE" } },
      }),
      prisma.amcContract.count({
        where: {
          status: "ACTIVE",
          endDate: { gte: todayDate, lte: addDaysUtc(todayDate, 30) },
          renewals: { none: {} },
        },
      }),
    ]);

  // Open leads: overdue follow-ups, leads nobody has contacted, and leads gone quiet.
  const overdueByOwner: Record<string, number> = {};
  const staleByOwner: Record<string, number> = {};
  const overdue: (LeadListItem & { sortKey: number })[] = [];
  const neverContacted: (LeadListItem & { sortKey: number })[] = [];
  const stale: (LeadListItem & { sortKey: number })[] = [];

  for (const lead of openLeads) {
    const owner = lead.assignedToId;
    const base = { id: lead.id, customerName: lead.customerName, ownerName: lead.assignedTo?.name ?? null };
    const last = lead.followUps[0];

    // Follow-up dates are calendar dates stored at UTC midnight, so "before today" compares directly.
    if (last?.nextFollowUpDate && last.nextFollowUpDate < todayDate) {
      if (owner) overdueByOwner[owner] = (overdueByOwner[owner] ?? 0) + 1;
      overdue.push({ ...base, note: `due ${formatDate(last.nextFollowUpDate)}`, sortKey: last.nextFollowUpDate.getTime() });
    }

    if (!last) {
      if (daysSince(lead.createdAt, now) >= FIRST_CONTACT_DAYS) {
        neverContacted.push({ ...base, note: `added ${formatDate(lead.createdAt)}`, sortKey: lead.createdAt.getTime() });
      }
    } else if (daysSince(last.followUpDate, now) >= STALE_DAYS) {
      if (owner) staleByOwner[owner] = (staleByOwner[owner] ?? 0) + 1;
      stale.push({ ...base, note: `last contact ${formatDate(last.followUpDate)}`, sortKey: last.followUpDate.getTime() });
    }
  }

  const oldestFirst = (items: (LeadListItem & { sortKey: number })[]): LeadListItem[] =>
    items
      .sort((a, b) => a.sortKey - b.sortKey)
      .slice(0, LIST_LIMIT)
      .map((item) => ({ id: item.id, customerName: item.customerName, ownerName: item.ownerName, note: item.note }));

  const chatByUser: Record<string, number> = {};
  for (const row of chat) chatByUser[row.authorId] = row._count._all;
  const tasksOverdueByUser: Record<string, number> = {};
  for (const row of overdueTasks) tasksOverdueByUser[row.assignedToId] = row._count._all;

  return buildTeamReport({
    window,
    users,
    activity: activity.map((row) => ({
      userId: row.userId,
      action: row.action,
      count: row._count._all,
      lastAt: row._max.createdAt,
    })),
    chatByUser,
    newLeads,
    overdueByOwner,
    staleByOwner,
    tasksOverdueByUser,
    lists: { overdue: oldestFirst(overdue), neverContacted: oldestFirst(neverContacted), stale: oldestFirst(stale) },
    service: { ticketsPastSla, visitsOverdue, renewalsSoon },
  });
}
