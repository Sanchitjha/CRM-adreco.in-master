import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Boxes, Contact, IndianRupee, LifeBuoy, Pencil, Target, TrendingUp } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canManageDealerFinance, canView } from "@/lib/rbac";
import { formatDate } from "@/lib/dates";
import { addDaysUtc, dealerIncentive } from "@/lib/lifecycle";
import { TICKET_STATUS } from "@/lib/statuses";
import { formatINR } from "@/lib/utils";
import { Badge, SectionCard, StatCard } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";
import { ActivityTimeline, BackLink, CustomerLink, InfoGrid, StatusPill } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { ActionButton } from "@/components/action-forms";
import { addTarget, deleteTarget, setDealerStock, toggleDealerActive, updateOutstanding } from "../actions";

export default async function DealerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!canView(user.role, "dealers")) redirect("/");

  const dealer = await prisma.dealer.findUnique({
    where: { id },
    include: {
      stock: { include: { product: true }, orderBy: { product: { name: "asc" } } },
      targets: { orderBy: { startDate: "desc" } },
      leads: { orderBy: { createdAt: "desc" }, take: 15 },
      _count: { select: { leads: true } },
    },
  });
  if (!dealer) notFound();

  const manage = canManage(user.role, "dealers");
  const finance = canManageDealerFinance(user.role);

  const [orders, tickets, products] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { status: { not: "CANCELLED" }, lead: { dealerId: id } },
      select: { grandTotal: true, orderDate: true },
    }),
    canView(user.role, "tickets")
      ? prisma.serviceTicket.findMany({
          where: { lead: { dealerId: id } },
          include: { lead: true },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
    manage ? prisma.product.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, modelCode: true } }) : Promise.resolve([]),
  ]);

  const lifetime = orders.reduce((sum, o) => sum + Number(o.grandTotal), 0);
  const achievedIn = (start: Date, end: Date) => {
    const to = addDaysUtc(end, 1).getTime();
    return orders
      .filter((o) => o.orderDate.getTime() >= start.getTime() && o.orderDate.getTime() < to)
      .reduce((sum, o) => sum + Number(o.grandTotal), 0);
  };

  return (
    <div className="space-y-6">
      <BackLink href="/dealers" label="Back to dealers" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{dealer.name}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {[dealer.code, dealer.city, dealer.state].filter(Boolean).join(" · ") || "No location recorded"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dealer.territory && <Badge tone="brand">{dealer.territory}</Badge>}
          <Badge tone={dealer.active ? "success" : "neutral"} dot>
            {dealer.active ? "Active" : "Inactive"}
          </Badge>
          {manage && (
            <>
              <Link href={`/dealers/${dealer.id}/edit`} className="btn btn-secondary btn-sm">
                <Pencil className="size-3.5" />
                Edit
              </Link>
              <ActionButton
                action={toggleDealerActive}
                hidden={{ dealerId: dealer.id }}
                label={dealer.active ? "Deactivate" : "Reactivate"}
                confirm={dealer.active ? "Deactivate this dealer? Their history is kept." : undefined}
              />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Leads sourced" value={dealer._count.leads} icon={Contact} accent="violet" />
        <StatCard label="Sales to date" value={formatINR(lifetime)} icon={TrendingUp} accent="emerald" hint={`${orders.length} confirmed orders`} />
        <StatCard label="Outstanding" value={formatINR(Number(dealer.outstandingBalance))} icon={IndianRupee} accent="amber" />
        <StatCard label="Complaints" value={tickets.length} icon={LifeBuoy} accent="rose" hint="On their customers' machines" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Targets and incentives" description="Incentive is earned on the full achieved amount once the target is met" icon={Target} bodyClassName="p-0">
            {dealer.targets.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">No targets set.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {dealer.targets.map((t) => {
                  const target = Number(t.targetAmount);
                  const achieved = achievedIn(t.startDate, t.endDate);
                  const pct = target > 0 ? Math.min(100, Math.round((achieved / target) * 100)) : 0;
                  const incentive = dealerIncentive(achieved, target, Number(t.incentivePct));
                  return (
                    <li key={t.id} className="px-5 py-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-800">{t.periodLabel}</p>
                          <p className="text-xs text-slate-400">
                            {formatDate(t.startDate)} – {formatDate(t.endDate)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm tabular-nums text-slate-600">
                            {formatINR(achieved)} of {formatINR(target)}
                          </span>
                          {finance && (
                            <ActionButton
                              action={deleteTarget}
                              hidden={{ targetId: t.id }}
                              label="Remove"
                              variant="ghost"
                              confirm={`Remove the target “${t.periodLabel}”?`}
                            />
                          )}
                        </div>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : "bg-brand-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-slate-400">
                        {pct}% of target
                        {Number(t.incentivePct) > 0 &&
                          ` · ${Number(t.incentivePct)}% incentive${incentive > 0 ? ` earned: ${formatINR(incentive)}` : " (target not yet met)"}`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            {finance && (
              <div className="border-t border-[var(--border)] px-5 py-4">
                <AutoForm
                  action={addTarget}
                  submitLabel="Add target"
                  compact
                  resetOnSuccess
                  fields={[
                    { kind: "hidden", name: "dealerId", value: dealer.id },
                    { name: "periodLabel", label: "Period", required: true, placeholder: "e.g. FY 2026-27 Q3", span: 2 },
                    { name: "startDate", label: "Starts", kind: "date", required: true },
                    { name: "endDate", label: "Ends", kind: "date", required: true },
                    { name: "targetAmount", label: "Target sales (₹)", kind: "number", min: 0, step: "0.01", required: true },
                    { name: "incentivePct", label: "Incentive (%)", kind: "number", min: 0, max: 100, step: "0.01", placeholder: "0" },
                  ]}
                />
              </div>
            )}
          </SectionCard>

          <SectionCard title="Dealer stock" description="Machines and parts held by the dealer" icon={Boxes} bodyClassName="p-0">
            {dealer.stock.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">No stock recorded.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {dealer.stock.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{s.product.name}</p>
                      <p className="text-xs text-slate-400">{s.product.modelCode}</p>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-slate-800">{s.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
            {manage && (
              <div className="border-t border-[var(--border)] px-5 py-4">
                <AutoForm
                  action={setDealerStock}
                  submitLabel="Set stock"
                  compact
                  resetOnSuccess
                  fields={[
                    { kind: "hidden", name: "dealerId", value: dealer.id },
                    {
                      kind: "select",
                      name: "productId",
                      label: "Product",
                      required: true,
                      options: products.map((p) => ({ value: p.id, label: `${p.name} (${p.modelCode})` })),
                    },
                    { name: "quantity", label: "Quantity on hand", kind: "number", min: 0, required: true },
                  ]}
                />
              </div>
            )}
          </SectionCard>

          <SectionCard title="Leads they brought in" icon={Contact} bodyClassName="p-0">
            {dealer.leads.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-400">
                No leads are linked to this dealer yet. Choose the dealer when creating a lead.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {dealer.leads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <CustomerLink role={user.role} leadId={l.id} name={l.customerName} />
                      <p className="text-xs text-slate-400">{formatDate(l.createdAt)}</p>
                    </div>
                    <StatusBadge status={l.status} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {tickets.length > 0 && (
            <SectionCard title="Complaint history" description="Service tickets from this dealer's customers" icon={LifeBuoy} bodyClassName="p-0">
              <ul className="divide-y divide-[var(--border)]">
                {tickets.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <Link href={`/tickets/${t.id}`} className="text-sm font-medium text-slate-800 hover:text-brand-600">
                        {t.ticketNumber}
                      </Link>
                      <p className="truncate text-xs text-slate-400">
                        {t.lead.customerName} · {t.subject}
                      </p>
                    </div>
                    <StatusPill meta={TICKET_STATUS[t.status]} />
                  </li>
                ))}
              </ul>
            </SectionCard>
          )}

          <ActivityTimeline entityType="Dealer" entityId={dealer.id} />
        </div>

        <div className="space-y-6">
          <SectionCard title="Profile" icon={Contact}>
            <InfoGrid
              columns={1}
              items={[
                { label: "Contact", value: dealer.contactPerson },
                { label: "Phone", value: dealer.phone },
                { label: "Email", value: dealer.email },
                { label: "GSTIN", value: dealer.gstin },
                { label: "Address", value: dealer.address },
                { label: "Notes", value: dealer.notes },
              ]}
            />
          </SectionCard>

          {finance && (
            <SectionCard title="Outstanding balance" description="Amount the dealer currently owes" icon={IndianRupee}>
              <AutoForm
                action={updateOutstanding}
                submitLabel="Update balance"
                columns={1}
                compact
                fields={[
                  { kind: "hidden", name: "dealerId", value: dealer.id },
                  {
                    name: "outstandingBalance",
                    label: "Outstanding (₹)",
                    kind: "number",
                    min: 0,
                    step: "0.01",
                    required: true,
                    defaultValue: Number(dealer.outstandingBalance),
                  },
                ]}
              />
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
