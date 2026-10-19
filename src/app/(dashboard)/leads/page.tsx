import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus, Contact, Search } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader, Card, Avatar, EmptyState, Badge } from "@/components/ui";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const session = await auth();
  const role = session!.user.role;

  const scope: Prisma.LeadWhereInput = role === "ADMIN" ? {} : { assignedToId: session!.user.id };
  const search: Prisma.LeadWhereInput = q
    ? {
        OR: [
          { customerName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const leads = await prisma.lead.findMany({
    where: { AND: [scope, search] },
    include: { assignedTo: true },
    orderBy: { createdAt: "desc" },
  });

  const cols = role === "ADMIN" ? 6 : 5;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Contact}
        title="Leads"
        description="Every enquiry, from first contact to conversion."
        actions={
          <Link href="/leads/new" className="btn btn-primary">
            <Plus className="size-4" />
            New lead
          </Link>
        }
      />

      {q && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Search className="size-4" />
          <span>
            {leads.length} result{leads.length === 1 ? "" : "s"} for
          </span>
          <Badge tone="brand">{q}</Badge>
          <Link href="/leads" className="text-brand-600 hover:text-brand-700">
            Clear
          </Link>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50/70 text-left">
                <th className="px-5 py-3 font-medium text-slate-500">Customer</th>
                <th className="px-5 py-3 font-medium text-slate-500">Phone</th>
                <th className="px-5 py-3 font-medium text-slate-500">Category</th>
                <th className="px-5 py-3 font-medium text-slate-500">Status</th>
                {role === "ADMIN" && <th className="px-5 py-3 font-medium text-slate-500">Assigned to</th>}
                <th className="px-5 py-3 text-right font-medium text-slate-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={cols} className="p-0">
                    <EmptyState
                      icon={Contact}
                      title={q ? "No matching leads" : "No leads yet"}
                      description={q ? "Try a different name, phone or email." : "Create your first lead to get started."}
                    />
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="transition hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={lead.customerName} />
                        <div className="min-w-0">
                          <Link href={`/leads/${lead.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                            {lead.customerName}
                          </Link>
                          {lead.email && <div className="truncate text-xs text-slate-400">{lead.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{lead.phone}</td>
                    <td className="px-5 py-3 text-slate-600">{lead.productCategory ?? "—"}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={lead.status} />
                    </td>
                    {role === "ADMIN" && (
                      <td className="px-5 py-3 text-slate-600">
                        {lead.assignedTo?.name ?? <span className="text-slate-400">Unassigned</span>}
                      </td>
                    )}
                    <td className="px-5 py-3 text-right text-slate-400">
                      {lead.createdAt.toLocaleDateString("en-IN")}
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
