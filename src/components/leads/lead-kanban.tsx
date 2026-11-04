"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { type LeadStatus } from "@prisma/client";
import {
  Phone,
  Clock,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Calendar,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { Avatar, Badge } from "@/components/ui";
import { formatINR } from "@/lib/utils";
import { WhatsAppAction } from "@/components/whatsapp/whatsapp-modal";
import { quickMoveLeadStage } from "@/app/(dashboard)/leads/actions";

export interface KanbanLead {
  id: string;
  customerName: string;
  phone: string;
  email?: string | null;
  productCategory?: string | null;
  budget?: number | string | null;
  status: LeadStatus;
  createdAt: string;
  assignedToName?: string | null;
  assignedToId?: string | null;
  followUpCount?: number;
  lastFollowUpDaysAgo?: number | null;
  hasSurvey?: boolean;
  hasQuotation?: boolean;
  quotationAmount?: number | null;
  aiScore?: number;
  aiWinProbability?: "High" | "Medium" | "Low";
}

interface ColumnDef {
  status: LeadStatus;
  title: string;
  accent: string;
  badgeBg: string;
}

const KANBAN_COLUMNS: ColumnDef[] = [
  { status: "NEW", title: "New Enquiries", accent: "border-sky-500", badgeBg: "bg-sky-50 text-sky-700 ring-sky-200" },
  { status: "CONTACTED", title: "Contacted", accent: "border-amber-500", badgeBg: "bg-amber-50 text-amber-700 ring-amber-200" },
  { status: "FOLLOW_UP", title: "In Discussion", accent: "border-indigo-500", badgeBg: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  { status: "QUOTED", title: "Proposal Sent", accent: "border-purple-500", badgeBg: "bg-purple-50 text-purple-700 ring-purple-200" },
  { status: "CONVERTED", title: "Won / Converted", accent: "border-emerald-500", badgeBg: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { status: "LOST", title: "Closed / Lost", accent: "border-slate-400", badgeBg: "bg-slate-100 text-slate-600 ring-slate-200" },
];

export function LeadKanban({
  initialLeads,
  canEdit = true,
}: {
  initialLeads: KanbanLead[];
  canEdit?: boolean;
}) {
  const [leads, setLeads] = useState<KanbanLead[]>(initialLeads);
  const [movingLeadId, setMovingLeadId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Compute stage budgets and counts
  const stageStats = KANBAN_COLUMNS.reduce<Record<LeadStatus, { count: number; total: number }>>(
    (acc, col) => {
      const colLeads = leads.filter((l) => l.status === col.status);
      const total = colLeads.reduce((sum, l) => sum + (l.budget ? Number(l.budget) : 0), 0);
      acc[col.status] = { count: colLeads.length, total };
      return acc;
    },
    {} as Record<LeadStatus, { count: number; total: number }>,
  );

  // Open deals only, matching the dashboard: won and lost leads are no longer "in the pipeline".
  const totalPipelineBudget = leads.reduce(
    (sum, l) => (l.status !== "LOST" && l.status !== "CONVERTED" && l.budget ? sum + Number(l.budget) : sum),
    0,
  );

  function handleMoveStage(leadId: string, currentStatus: LeadStatus, direction: "next" | "prev") {
    const colOrder: LeadStatus[] = ["NEW", "CONTACTED", "FOLLOW_UP", "QUOTED", "CONVERTED"];
    const idx = colOrder.indexOf(currentStatus);
    if (idx === -1) return;

    const targetIdx = direction === "next" ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= colOrder.length) return;
    const nextStatus = colOrder[targetIdx];

    // Optimistic UI update
    setMovingLeadId(leadId);
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: nextStatus } : l)),
    );

    startTransition(async () => {
      await quickMoveLeadStage(leadId, nextStatus);
      setMovingLeadId(null);
    });
  }

  function handleDirectStatusChange(leadId: string, newStatus: LeadStatus) {
    setMovingLeadId(leadId);
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)),
    );

    startTransition(async () => {
      await quickMoveLeadStage(leadId, newStatus);
      setMovingLeadId(null);
    });
  }

  return (
    <div className="space-y-4">
      {/* Pipeline Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-4 text-white shadow-md">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-brand-500/20 p-2.5 ring-1 ring-brand-400/30">
            <Sparkles className="size-5 text-brand-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Active Pipeline Value
              </span>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                Live view
              </span>
            </div>
            <p className="text-2xl font-bold tracking-tight text-white">
              {formatINR(totalPipelineBudget)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm text-slate-300">
          <div>
            <span className="block text-xs text-slate-400">Total Deals</span>
            <span className="font-semibold text-white">{leads.length}</span>
          </div>
          <div className="h-8 w-px bg-slate-700" />
          <div>
            <span className="block text-xs text-slate-400">Proposals Quoted</span>
            <span className="font-semibold text-white">{stageStats["QUOTED"]?.count || 0}</span>
          </div>
          <div className="h-8 w-px bg-slate-700" />
          <div>
            <span className="block text-xs text-slate-400">Won</span>
            <span className="font-semibold text-emerald-400">{stageStats["CONVERTED"]?.count || 0}</span>
          </div>
        </div>
      </div>

      {/* Kanban Horizontal Columns Scroll Container */}
      <div className="flex gap-4 overflow-x-auto pb-4 pt-1">
        {KANBAN_COLUMNS.map((col) => {
          const colLeads = leads.filter((l) => l.status === col.status);
          const stats = stageStats[col.status] || { count: 0, total: 0 };

          return (
            <div
              key={col.status}
              className="flex w-72 shrink-0 flex-col rounded-xl border border-slate-200/70 bg-slate-50/60 shadow-sm"
            >
              {/* Column Header */}
              <div
                className={`border-t-4 ${col.accent} rounded-t-xl border-b border-slate-200/80 bg-white p-3`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">{col.title}</h3>
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold ring-1 ring-inset ${col.badgeBg}`}
                  >
                    {stats.count}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
                  <span>Stage Value:</span>
                  <span className="font-semibold text-slate-800">{formatINR(stats.total)}</span>
                </div>
              </div>

              {/* Cards Container */}
              <div className="flex-1 space-y-3 p-3">
                {colLeads.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center">
                    <p className="text-xs text-slate-400">No leads in this stage</p>
                  </div>
                ) : (
                  colLeads.map((lead) => {
                    const isMoving = movingLeadId === lead.id && isPending;
                    const daysAgo = Math.floor(
                      (Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24),
                    );

                    return (
                      <div
                        key={lead.id}
                        className={`group relative rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-all hover:border-brand-400 hover:shadow-md ${
                          isMoving ? "opacity-50" : ""
                        }`}
                      >
                        {/* Top: Customer name & WhatsApp */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/leads/${lead.id}`}
                              className="font-semibold text-slate-900 hover:text-brand-600 line-clamp-1"
                            >
                              {lead.customerName}
                            </Link>
                            {lead.productCategory && (
                              <span className="mt-0.5 inline-block text-[11px] font-medium text-slate-500">
                                {lead.productCategory}
                              </span>
                            )}
                          </div>

                          {/* 1-Click WhatsApp trigger */}
                          <WhatsAppAction
                            customerName={lead.customerName}
                            phone={lead.phone}
                            leadId={lead.id}
                            productCategory={lead.productCategory}
                            budget={lead.budget}
                            variant="icon"
                          />
                        </div>

                        {/* Middle: Deal Value */}
                        <div className="mt-2.5 flex items-baseline justify-between border-t border-slate-100 pt-2">
                          <span className="text-xs text-slate-400">Deal Value</span>
                          <span className="text-sm font-bold text-slate-900">
                            {lead.budget ? formatINR(Number(lead.budget)) : "—"}
                          </span>
                        </div>

                        {/* AI Insight Badge if available */}
                        {lead.aiWinProbability && (
                          <div className="mt-2 flex items-center justify-between rounded-md bg-brand-50/70 px-2 py-1 text-[11px]">
                            <span className="flex items-center gap-1 font-medium text-brand-700">
                              <Sparkles className="size-3 text-brand-600" />
                              Win Probability
                            </span>
                            <span
                              className={`font-bold ${
                                lead.aiWinProbability === "High"
                                  ? "text-emerald-700"
                                  : lead.aiWinProbability === "Medium"
                                  ? "text-amber-700"
                                  : "text-slate-600"
                              }`}
                            >
                              {lead.aiWinProbability}
                            </span>
                          </div>
                        )}

                        {/* Bottom Row: Rep Avatar & Stage Navigation */}
                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                          <div className="flex items-center gap-1.5" title={`Assigned to: ${lead.assignedToName || "Unassigned"}`}>
                            <Avatar name={lead.customerName} className="size-6 text-[10px]" />
                            <span className="truncate text-[11px] text-slate-500 max-w-[80px]">
                              {lead.assignedToName || "Unassigned"}
                            </span>
                          </div>

                          {/* 1-Click Stage Advance Controls */}
                          {canEdit && (
                            <div className="flex items-center gap-1">
                              {col.status !== "NEW" && (
                                <button
                                  type="button"
                                  title="Previous Stage"
                                  onClick={() => handleMoveStage(lead.id, lead.status, "prev")}
                                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                >
                                  <ChevronLeft className="size-3.5" />
                                </button>
                              )}

                              {col.status !== "CONVERTED" && col.status !== "LOST" && (
                                <button
                                  type="button"
                                  title="Advance Stage"
                                  onClick={() => handleMoveStage(lead.id, lead.status, "next")}
                                  className="flex items-center gap-0.5 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700 hover:bg-brand-100"
                                >
                                  Next <ChevronRight className="size-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
