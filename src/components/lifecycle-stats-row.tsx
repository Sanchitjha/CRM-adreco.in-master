import { CalendarClock, LifeBuoy, ShieldCheck, ShoppingCart, Wrench } from "lucide-react";
import type { LifecycleStats } from "@/lib/lifecycle-stats";
import { StatCard } from "@/components/ui";

/** Dashboard shortcuts into the lifecycle modules. Only the figures a role has access to are shown. */
export function LifecycleStatsRow({ stats }: { stats: LifecycleStats }) {
  const cards = [
    stats.openOrders !== null && (
      <StatCard key="orders" label="Open orders" value={stats.openOrders} icon={ShoppingCart} accent="brand" href="/sales-orders" hint="Confirmed to dispatched" />
    ),
    stats.activeInstallations !== null && (
      <StatCard key="installs" label="Installations in progress" value={stats.activeInstallations} icon={Wrench} accent="violet" href="/installations" />
    ),
    stats.openTickets !== null && (
      <StatCard
        key="tickets"
        label="Open service tickets"
        value={stats.openTickets}
        icon={LifeBuoy}
        accent={stats.breachedTickets ? "rose" : "emerald"}
        href="/tickets"
        hint={stats.breachedTickets ? `${stats.breachedTickets} past their SLA` : "All within SLA"}
      />
    ),
    stats.renewalsDue !== null && (
      <StatCard key="amc" label="AMC renewals due" value={stats.renewalsDue} icon={CalendarClock} accent="amber" href="/amc?view=renewals" hint="Ending within 60 days" />
    ),
    stats.warrantiesExpiring !== null && (
      <StatCard key="warranty" label="Warranties expiring" value={stats.warrantiesExpiring} icon={ShieldCheck} accent="slate" href="/warranty?view=expiring" hint="Within 30 days" />
    ),
  ].filter(Boolean);

  if (cards.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Customer lifecycle</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">{cards}</div>
    </section>
  );
}
