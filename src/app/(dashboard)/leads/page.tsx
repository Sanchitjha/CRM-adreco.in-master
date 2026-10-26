import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus, Contact, Search, LayoutGrid, List, Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/status-badge";
import { PageHeader, Card, Avatar, EmptyState, Badge } from "@/components/ui";
import { formatINR } from "@/lib/utils";
import { LeadKanban, type KanbanLead } from "@/components/leads/lead-kanban";
import { ZohoChatAction } from "@/components/zoho/zoho-chat-modal";
import { generateHeuristicInsight } from "@/lib/ai";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; view?: string }>;
}) {
  const { q, view } = await searchParams;
  const isTableView = view === "table";
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
    include: {
      assignedTo: true,
      followUps: { select: { id: true, followUpDate: true }, orderBy: { followUpDate: "desc" }, take: 1 },
      siteSurveys: { select: { id: true }, take: 1 },
      quotations: { select: { id: true, grandTotal: true }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  // Map to KanbanLead with instant heuristic scoring (zero external LLM rate-limit latency)
  const kanbanLeads: KanbanLead[] = leads.map((l) => {
    const lastFollowUp = l.followUps[0];
    const daysSinceFollowUp = lastFollowUp
      ? Math.floor((Date.now() - new Date(lastFollowUp.followUpDate).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const insight = generateHeuristicInsight({
      id: l.id,
      customerName: l.customerName,
      phone: l.phone,
      email: l.email,
      productCategory: l.productCategory,
      budget: l.budget ? Number(l.budget) : null,
      status: l.status,
      createdAt: l.createdAt,
      requirementNotes: l.requirementNotes,
      hasSurvey: l.siteSurveys.length > 0,
      hasQuotation: l.quotations.length > 0,
      quotationAmount: l.quotations[0] ? Number(l.quotations[0].grandTotal) : null,
      lastFollowUpDaysAgo: daysSinceFollowUp,
    });

    return {
      id: l.id,
      customerName: l.customerName,
      phone: l.phone,
      email: l.email,
      productCategory: l.productCategory,
      budget: l.budget ? Number(l.budget) : null,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
      assignedToName: l.assignedTo?.name ?? null,
      assignedToId: l.assignedToId,
      followUpCount: l.followUps.length,
      lastFollowUpDaysAgo: daysSinceFollowUp,
      hasSurvey: l.siteSurveys.length > 0,
      hasQuotation: l.quotations.length > 0,
      quotationAmount: l.quotations[0] ? Number(l.quotations[0].grandTotal) : null,
      aiScore: insight.score,
      aiWinProbability: insight.winProbability,
    };
  });

  const cols = role === "ADMIN" ? 7 : 6;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Contact}
        title="Leads & Sales Pipeline"
        description="Odoo-grade pipeline management, WhatsApp omnichannel chat, and AI lead advisor."
        actions={
          <div className="flex items-center gap-2">
            {/* View Switcher */}
            <div className="flex items-center rounded-lg border border-[var(--border)] bg-slate-100 p-0.5 text-xs font-semibold">
              <Link
                href={`/leads${q ? `?q=${encodeURIComponent(q)}` : ""}`}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition ${
                  !isTableView
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <LayoutGrid className="size-3.5" />
                <span>Kanban</span>
              </Link>
              <Link
                href={`/leads?view=table${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition ${
                  isTableView
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <List className="size-3.5" />
                <span>List</span>
              </Link>
            </div>

            <Link href="/leads/new" className="btn btn-primary">
              <Plus className="size-4" />
              New lead
            </Link>
          </div>
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

      {/* Conditional View: Kanban (Odoo style) vs Table */}
      {!isTableView ? (
        <LeadKanban initialLeads={kanbanLeads} canEdit={role === "ADMIN" || role === "SALES"} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-slate-50/70 text-left">
                  <th className="px-5 py-3 font-medium text-slate-500">Customer</th>
                  <th className="px-5 py-3 font-medium text-slate-500">Zoho Chat / Phone</th>
                  <th className="px-5 py-3 font-medium text-slate-500">Category</th>
                  <th className="px-5 py-3 font-medium text-slate-500">Budget</th>
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
                      <td className="px-5 py-3 text-slate-600">
                        <div className="flex items-center gap-2">
                          <span>{lead.phone}</span>
                          <ZohoChatAction
                            customerName={lead.customerName}
                            phone={lead.phone}
                            email={lead.email}
                            leadId={lead.id}
                            productCategory={lead.productCategory}
                            budget={lead.budget ? Number(lead.budget) : null}
                            variant="icon"
                          />
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{lead.productCategory ?? "—"}</td>
                      <td className="px-5 py-3 font-semibold text-slate-800">
                        {lead.budget ? formatINR(Number(lead.budget)) : "—"}
                      </td>
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
      )}
    </div>
  );
}
