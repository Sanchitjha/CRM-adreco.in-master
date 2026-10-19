import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { FileText, Plus } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canAccessQuotations } from "@/lib/rbac";
import { formatINR } from "@/lib/utils";
import { PageHeader, Card, EmptyState, Avatar } from "@/components/ui";
import { QuoteStatusBadge } from "@/components/quotations/quote-status-badge";

export default async function QuotationsPage() {
  const session = await auth();
  const { role, id: userId } = session!.user;
  if (!canAccessQuotations(role)) redirect("/");

  const where: Prisma.QuotationWhereInput =
    role === "SALES"
      ? { OR: [{ createdById: userId }, { lead: { assignedToId: userId } }] }
      : {};

  const quotes = await prisma.quotation.findMany({
    where,
    include: { lead: true, createdBy: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileText}
        title="Quotations"
        description="Technical proposals and commercial quotes for each lead."
        actions={
          <Link href="/quotations/new" className="btn btn-primary">
            <Plus className="size-4" />
            New quotation
          </Link>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50/70 text-left">
                <th className="px-5 py-3 font-medium text-slate-500">Quote #</th>
                <th className="px-5 py-3 font-medium text-slate-500">Customer</th>
                <th className="px-5 py-3 font-medium text-slate-500">Status</th>
                <th className="px-5 py-3 text-right font-medium text-slate-500">Amount</th>
                <th className="px-5 py-3 font-medium text-slate-500">Prepared by</th>
                <th className="px-5 py-3 text-right font-medium text-slate-500">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {quotes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    <EmptyState
                      icon={FileText}
                      title="No quotations yet"
                      description="Prepare a quote from a lead or a completed site survey."
                    />
                  </td>
                </tr>
              ) : (
                quotes.map((q) => (
                  <tr key={q.id} className="transition hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <Link href={`/quotations/${q.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                        {q.quoteNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={q.lead.customerName} />
                        <span className="text-slate-700">{q.lead.customerName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <QuoteStatusBadge status={q.status} />
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-slate-800">
                      {formatINR(Number(q.grandTotal))}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{q.createdBy.name}</td>
                    <td className="px-5 py-3 text-right text-slate-400">
                      {q.createdAt.toLocaleDateString("en-IN")}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
