import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Package,
  IndianRupee,
  Radio,
  Waypoints,
  MessageSquarePlus,
  History,
  GitCommitVertical,
  ClipboardCheck,
  FileText,
  Plus,
  ChevronRight,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { formatINR } from "@/lib/utils";
import { canAccessDepartment, canAccessSurveys, canAccessQuotations } from "@/lib/rbac";
import { StatusBadge } from "@/components/status-badge";
import { StatusControl } from "@/components/leads/status-control";
import { AssignControl } from "@/components/leads/assign-control";
import { FollowUpForm } from "@/components/leads/follow-up-form";
import { StageActions } from "@/components/queue/stage-actions";
import { DocumentsSection, type DocumentRow } from "@/components/leads/documents-section";
import { SectionCard, Avatar, Badge, EmptyState } from "@/components/ui";
import { AiLeadAdvisor } from "@/components/ai/ai-lead-advisor";
import { WhatsAppAction } from "@/components/whatsapp/whatsapp-modal";
import { ZohoSyncButton } from "@/components/leads/zoho-sync-button";
import { analyzeLeadWithAi } from "@/lib/ai";

function formatBudget(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN")}` : "—";
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const isAdmin = session!.user.role === "ADMIN";
  const isOwningSalesRep = session!.user.role === "SALES";

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      assignedTo: true,
      createdBy: true,
      currentDepartment: true,
      followUps: { orderBy: { followUpDate: "desc" }, include: { user: true } },
      departmentStages: { orderBy: { enteredAt: "asc" }, include: { department: true, assignedTo: true } },
      documents: { orderBy: { createdAt: "asc" }, include: { uploadedBy: true } },
      siteSurveys: { orderBy: { surveyDate: "desc" }, include: { surveyedBy: true } },
      quotations: { orderBy: { createdAt: "desc" }, include: { createdBy: true } },
    },
  });

  if (!lead) notFound();

  const isSalesOwner = isOwningSalesRep && lead.assignedToId === session!.user.id;
  const isDepartmentViewer = canAccessDepartment(session!.user.role, lead.currentDepartment?.name);
  if (!isAdmin && !isSalesOwner && !isDepartmentViewer) notFound();

  const canManageSalesFields = isAdmin || isSalesOwner;
  const canSurvey =
    canAccessSurveys(session!.user.role) &&
    (isAdmin || session!.user.role === "DESIGN" || isSalesOwner);
  const canQuote =
    canAccessQuotations(session!.user.role) &&
    (isAdmin || session!.user.role === "DESIGN" || isSalesOwner);
  const activeStage = lead.departmentStages.find((s) => s.status !== "COMPLETED");
  const canActOnActiveStage =
    activeStage && (isAdmin || canAccessDepartment(session!.user.role, activeStage.department.name));

  const salesUsers = isAdmin
    ? await prisma.user.findMany({
        where: { role: "SALES", active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const details: { icon: typeof Phone; label: string; value: React.ReactNode }[] = [
    { icon: Phone, label: "Phone", value: lead.phone },
    { icon: Mail, label: "Email", value: lead.email ?? "—" },
    { icon: Package, label: "Product category", value: lead.productCategory ?? "—" },
    { icon: IndianRupee, label: "Budget", value: formatBudget(lead.budget) },
    { icon: Radio, label: "Source", value: lead.source ?? "—" },
    { icon: MapPin, label: "Address", value: lead.address ?? "—" },
  ];

  return (
    <div className="space-y-6">
      <Link href="/leads" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" />
        Back to leads
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={lead.customerName} className="size-12 text-base" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{lead.customerName}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {lead.phone}
              {lead.email ? ` · ${lead.email}` : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={lead.status} />
          {lead.currentDepartment && (
            <Badge tone="brand" dot>
              {lead.currentDepartment.name}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Activity column */}
        <div className="space-y-6 lg:col-span-2">
          {activeStage && (
            <SectionCard title={`Currently at: ${activeStage.department.name}`} icon={Waypoints}>
              {canActOnActiveStage ? (
                <StageActions leadId={lead.id} stageStatus={activeStage.status} />
              ) : (
                <p className="text-sm text-slate-500">Waiting on the {activeStage.department.name} team.</p>
              )}
            </SectionCard>
          )}

          {canManageSalesFields && (
            <SectionCard title="Log a follow-up" description="Record a call, visit or message" icon={MessageSquarePlus}>
              <FollowUpForm leadId={lead.id} />
            </SectionCard>
          )}

          <DocumentsSection
            leadId={lead.id}
            canAddRequirement={canManageSalesFields || Boolean(canActOnActiveStage)}
            documents={lead.documents.map(
              (d): DocumentRow => ({
                id: d.id,
                docType: d.docType,
                status: d.status,
                fileName: d.fileName,
                uploadedAt: d.uploadedAt ? d.uploadedAt.toISOString() : null,
                uploadedByName: d.uploadedBy?.name ?? null,
              }),
            )}
          />

          {(canSurvey || lead.siteSurveys.length > 0) && (
            <SectionCard
              title="Site surveys"
              description="Technical requirement for this lead"
              icon={ClipboardCheck}
              bodyClassName="p-0"
              action={
                canSurvey ? (
                  <Link href={`/surveys/new?leadId=${lead.id}`} className="btn btn-secondary btn-sm">
                    <Plus className="size-3.5" />
                    New survey
                  </Link>
                ) : undefined
              }
            >
              {lead.siteSurveys.length === 0 ? (
                <div className="px-5 py-4">
                  <p className="text-sm text-slate-400">No survey captured yet.</p>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {lead.siteSurveys.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/surveys/${s.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-slate-50/70"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">
                            {s.application}
                            {s.recommendedCapacityKw ? ` · ${s.recommendedCapacityKw} kW` : ""}
                          </p>
                          <p className="text-xs text-slate-400">
                            {s.surveyDate.toLocaleDateString("en-IN")} · {s.surveyedBy.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <SurveyStatusBadge status={s.status} />
                          <ChevronRight className="size-4 text-slate-300" />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          )}

          {(canQuote || lead.quotations.length > 0) && (
            <SectionCard
              title="Quotations"
              description="Proposals and commercial quotes"
              icon={FileText}
              bodyClassName="p-0"
              action={
                canQuote ? (
                  <Link href={`/quotations/new?leadId=${lead.id}`} className="btn btn-secondary btn-sm">
                    <Plus className="size-3.5" />
                    New quotation
                  </Link>
                ) : undefined
              }
            >
              {lead.quotations.length === 0 ? (
                <div className="px-5 py-4">
                  <p className="text-sm text-slate-400">No quotation prepared yet.</p>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {lead.quotations.map((q) => (
                    <li key={q.id}>
                      <Link
                        href={`/quotations/${q.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-slate-50/70"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">
                            {q.quoteNumber} · {formatINR(Number(q.grandTotal))}
                          </p>
                          <p className="text-xs text-slate-400">
                            {q.createdAt.toLocaleDateString("en-IN")} · {q.createdBy.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <QuoteStatusBadge status={q.status} />
                          <ChevronRight className="size-4 text-slate-300" />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          )}

          <SectionCard title="Department timeline" icon={GitCommitVertical}>
            {lead.departmentStages.length === 0 ? (
              <p className="text-sm text-slate-400">Not converted yet — still with Sales.</p>
            ) : (
              <ol className="relative space-y-5 pl-6">
                <span className="absolute left-[7px] top-1 bottom-1 w-px bg-[var(--border)]" aria-hidden />
                {lead.departmentStages.map((s) => {
                  const tone =
                    s.status === "COMPLETED" ? "bg-emerald-500" : s.status === "IN_PROGRESS" ? "bg-brand-500" : "bg-slate-300";
                  return (
                    <li key={s.id} className="relative">
                      <span className={`absolute -left-6 top-1 size-3.5 rounded-full ring-4 ring-white ${tone}`} aria-hidden />
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-800">{s.department.name}</span>
                        <Badge
                          tone={s.status === "COMPLETED" ? "success" : s.status === "IN_PROGRESS" ? "info" : "neutral"}
                        >
                          {s.status.replace("_", " ").toLowerCase()}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-400">
                        Entered {s.enteredAt.toLocaleDateString("en-IN")}
                        {s.completedAt ? ` · Completed ${s.completedAt.toLocaleDateString("en-IN")}` : ""}
                        {s.assignedTo ? ` · ${s.assignedTo.name}` : ""}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </SectionCard>

          <SectionCard title="Follow-up history" icon={History} bodyClassName="p-0">
            {lead.followUps.length === 0 ? (
              <EmptyState icon={History} title="No follow-ups logged yet" />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {lead.followUps.map((f) => (
                  <li key={f.id} className="px-5 py-3.5">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-medium text-slate-600">{f.user.name}</span>
                      <span>{f.followUpDate.toLocaleString("en-IN")}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{f.note}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
                      {f.outcome && <span>Outcome: {f.outcome}</span>}
                      {f.nextFollowUpDate && <span>Next: {f.nextFollowUpDate.toLocaleDateString("en-IN")}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        {/* Details rail */}
        <div className="space-y-6">
          <SectionCard title="Key details" icon={Package}>
            <dl className="space-y-3.5">
              {details.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <dt className="text-xs text-slate-400">{label}</dt>
                    <dd className="text-sm text-slate-800">{value}</dd>
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-3 border-t border-[var(--border)] pt-3.5">
                <Radio className="mt-0.5 size-4 shrink-0 text-slate-400" />
                <div>
                  <dt className="text-xs text-slate-400">Assigned to</dt>
                  <dd className="text-sm text-slate-800">{lead.assignedTo?.name ?? "Unassigned"}</dd>
                </div>
              </div>
            </dl>
            {lead.requirementNotes && (
              <div className="mt-4 rounded-lg bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-400">Requirement notes</p>
                <p className="mt-1 text-sm text-slate-700">{lead.requirementNotes}</p>
              </div>
            )}
          </SectionCard>

          {canManageSalesFields && (
            <SectionCard title="Manage" description="Update status and ownership" icon={Waypoints}>
              <div className="space-y-4">
                <div>
                  <p className="label">Status</p>
                  <StatusControl leadId={lead.id} currentStatus={lead.status} />
                </div>
                {isAdmin && (
                  <div className="border-t border-[var(--border)] pt-4">
                    <p className="label">Sales rep</p>
                    <AssignControl leadId={lead.id} currentAssignedToId={lead.assignedToId} salesUsers={salesUsers} />
                  </div>
                )}
              </div>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
