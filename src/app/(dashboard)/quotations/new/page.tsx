import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ArrowLeft, FileText } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canAccessQuotations } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { NewQuotationForm } from "@/components/quotations/new-quotation-form";

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string; surveyId?: string }>;
}) {
  const session = await auth();
  const { role, id: userId } = session!.user;
  if (!canAccessQuotations(role)) redirect("/");

  const { leadId, surveyId } = await searchParams;

  const leadWhere: Prisma.LeadWhereInput = role === "SALES" ? { assignedToId: userId } : {};
  const leads = await prisma.lead.findMany({
    where: leadWhere,
    select: { id: true, customerName: true },
    orderBy: { createdAt: "desc" },
  });

  const lockedLeadId = leadId && leads.some((l) => l.id === leadId) ? leadId : undefined;

  // Only carry a survey through if it belongs to the locked lead.
  let lockedSurveyId: string | undefined;
  if (lockedLeadId && surveyId) {
    const survey = await prisma.siteSurvey.findUnique({ where: { id: surveyId }, select: { leadId: true } });
    if (survey && survey.leadId === lockedLeadId) lockedSurveyId = surveyId;
  }

  return (
    <div className="space-y-6">
      <Link
        href={lockedLeadId ? `/leads/${lockedLeadId}` : "/quotations"}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="size-4" />
        {lockedLeadId ? "Back to lead" : "Back to quotations"}
      </Link>

      <PageHeader
        icon={FileText}
        title="New quotation"
        description="Build a line-item quote with discount, GST and charges."
      />

      <Card className="p-6">
        {leads.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No leads to quote yet"
            description="Create a lead first, then prepare its quotation."
            action={
              <Link href="/leads/new" className="btn btn-primary">
                Create a lead
              </Link>
            }
          />
        ) : (
          <NewQuotationForm leads={leads} lockedLeadId={lockedLeadId} lockedSurveyId={lockedSurveyId} />
        )}
      </Card>
    </div>
  );
}
