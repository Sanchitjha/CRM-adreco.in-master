import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { today } from "@/lib/dates";
import { EXPIRING_SOON_DAYS, RENEWAL_REMINDER_DAYS, addDaysUtc } from "@/lib/lifecycle";
import { canView } from "@/lib/rbac";
import { leadScope } from "@/lib/scope";

export type LifecycleStats = {
  openOrders: number | null;
  activeInstallations: number | null;
  openTickets: number | null;
  breachedTickets: number | null;
  renewalsDue: number | null;
  warrantiesExpiring: number | null;
};

/** Headline counts for the dashboard. A figure is null when the person's role has no access to that module. */
export async function lifecycleStats(role: Role, userId: string): Promise<LifecycleStats> {
  const scope = leadScope(role, userId);
  const todayDate = today();
  const now = new Date();
  const when = <T>(allowed: boolean, query: () => Promise<T>): Promise<T | null> => (allowed ? query() : Promise.resolve(null));

  const [openOrders, activeInstallations, openTickets, breachedTickets, renewalsDue, warrantiesExpiring] = await Promise.all([
    when(canView(role, "salesOrders"), () =>
      prisma.salesOrder.count({ where: { lead: scope, status: { in: ["CONFIRMED", "IN_PRODUCTION", "DISPATCHED"] } } }),
    ),
    when(canView(role, "installations"), () =>
      prisma.installation.count({ where: { lead: scope, status: { in: ["PENDING", "SCHEDULED", "IN_PROGRESS"] } } }),
    ),
    when(canView(role, "tickets"), () => prisma.serviceTicket.count({ where: { lead: scope, status: { not: "CLOSED" } } })),
    when(canView(role, "tickets"), () =>
      prisma.serviceTicket.count({ where: { lead: scope, status: { not: "CLOSED" }, slaDueAt: { lt: now } } }),
    ),
    when(canView(role, "amc"), () =>
      prisma.amcContract.count({
        where: {
          lead: scope,
          status: "ACTIVE",
          endDate: { gte: todayDate, lte: addDaysUtc(todayDate, Math.max(...RENEWAL_REMINDER_DAYS)) },
          renewals: { none: {} },
        },
      }),
    ),
    when(canView(role, "warranty"), () =>
      prisma.serialNumber.count({
        where: {
          ...(role === "SALES" ? { lead: scope } : {}),
          warrantyEndsOn: { gte: todayDate, lte: addDaysUtc(todayDate, EXPIRING_SOON_DAYS) },
        },
      }),
    ),
  ]);

  return { openOrders, activeInstallations, openTickets, breachedTickets, renewalsDue, warrantiesExpiring };
}
