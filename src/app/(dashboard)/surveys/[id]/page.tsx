import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ClipboardCheck, Package, ExternalLink, FileText } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canAccessSurveys, canAccessQuotations } from "@/lib/rbac";
import { SectionCard, Avatar, Badge } from "@/components/ui";
import { SurveyStatusBadge } from "@/components/surveys/survey-status-badge";
import { SurveyStatusControl } from "@/components/surveys/survey-status-control";
import { WhatsAppAction } from "@/components/whatsapp/whatsapp-modal";

function Row({ label, value, unit }: { label: string; value: number | string | null; unit?: string }) {
  if (value === null || value === "" || value === undefined) return null;
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">
        {value}
        {unit ? ` ${unit}` : ""}
      </dd>
    </div>
  );
}

export default async function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const { role, id: userId } = session!.user;
  if (!canAccessSurveys(role)) redirect("/");

  const survey = await prisma.siteSurvey.findUnique({
    where: { id },
    include: { lead: true, surveyedBy: true },
  });
  if (!survey) notFound();

  const canView =
    role === "ADMIN" ||
    role === "DESIGN" ||
    (role === "SALES" && (survey.surveyedById === userId || survey.lead.assignedToId === userId));
  if (!canView) notFound();

  const canEdit = role === "ADMIN" || role === "DESIGN" || survey.surveyedById === userId;

  return (
    <div className="space-y-6">
      <Link href="/surveys" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" />
        Back to surveys
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar name={survey.lead.customerName} className="size-12 text-base" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{survey.lead.customerName}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {survey.application} · Surveyed {survey.surveyDate.toLocaleDateString("en-IN")} by{" "}
              {survey.surveyedBy.name}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <WhatsAppAction
            customerName={survey.lead.customerName}
            phone={survey.lead.phone}
            leadId={survey.lead.id}
            productCategory={survey.lead.productCategory}
            surveyApplication={survey.application}
            variant="button"
            label="Message on WhatsApp"
          />
          <SurveyStatusBadge status={survey.status} />
          <Link href={`/leads/${survey.leadId}`} className="btn btn-secondary btn-sm">
            <ExternalLink className="size-3.5" />
            Open lead
          </Link>
          {canAccessQuotations(role) && (
            <Link
              href={`/quotations/new?leadId=${survey.leadId}&surveyId=${survey.id}`}
              className="btn btn-primary btn-sm"
            >
              <FileText className="size-3.5" />
              Create quotation
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Requirement" icon={ClipboardCheck}>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              <Row label="Application" value={survey.application} />
              <Row label="Required water temp" value={survey.requiredTempC} unit="°C" />
              <Row label="Ambient temp" value={survey.ambientTempC} unit="°C" />
              <Row label="Daily demand" value={survey.dailyDemandL} unit="L/day" />
              <Row label="Peak-hour demand" value={survey.peakHourL} unit="L" />
              <Row label="Number of users" value={survey.numberOfUsers} />
              <Row label="Pool size" value={survey.poolSize} />
              <Row label="Electrical supply" value={survey.electricalSupply} />
              <Row label="Installation location" value={survey.installLocation} />
              <Row label="Existing system" value={survey.existingSystem} />
              <Row label="Site address" value={survey.siteAddress} />
            </dl>
            {(survey.pipingDetails || survey.storageTank) && (
              <div className="mt-4 grid gap-4 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
                {survey.pipingDetails && (
                  <div>
                    <dt className="text-xs text-slate-400">Piping details</dt>
                    <dd className="mt-0.5 text-sm text-slate-700">{survey.pipingDetails}</dd>
                  </div>
                )}
                {survey.storageTank && (
                  <div>
                    <dt className="text-xs text-slate-400">Storage tank</dt>
                    <dd className="mt-0.5 text-sm text-slate-700">{survey.storageTank}</dd>
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Recommendation" icon={Package}>
            {survey.recommendedModel || survey.recommendedCapacityKw || survey.engineerRemarks ? (
              <>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                  <Row label="Recommended model" value={survey.recommendedModel} />
                  <Row label="Capacity" value={survey.recommendedCapacityKw} unit="kW" />
                  <Row label="Quantity" value={survey.recommendedQty} />
                </dl>
                {survey.engineerRemarks && (
                  <div className="mt-4 rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-400">Engineer remarks</p>
                    <p className="mt-1 text-sm text-slate-700">{survey.engineerRemarks}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">No recommendation recorded yet.</p>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          <SectionCard title="Survey" icon={ClipboardCheck}>
            <dl className="space-y-3.5">
              <Row label="Lead" value={survey.lead.customerName} />
              <Row label="Phone" value={survey.lead.phone} />
              <div>
                <dt className="text-xs text-slate-400">Status</dt>
                <dd className="mt-1">
                  <SurveyStatusBadge status={survey.status} />
                </dd>
              </div>
            </dl>
          </SectionCard>

          {canEdit ? (
            <SectionCard title="Update status" icon={ClipboardCheck}>
              <SurveyStatusControl surveyId={survey.id} currentStatus={survey.status} />
            </SectionCard>
          ) : (
            <Badge tone="neutral">Read-only</Badge>
          )}
        </div>
      </div>
    </div>
  );
}
