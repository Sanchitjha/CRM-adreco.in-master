import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canAccessSurveys } from "@/lib/rbac";
import { PageHeader, Card, EmptyState } from "@/components/ui";
import { NewSurveyForm } from "@/components/surveys/new-survey-form";

export default async function NewSurveyPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const session = await auth();
  const { role, id: userId } = session!.user;
  if (!canAccessSurveys(role)) redirect("/");

  const { leadId } = await searchParams;

  // SALES can only survey their own leads; ADMIN/DESIGN can survey any.
  const leadWhere: Prisma.LeadWhereInput = role === "SALES" ? { assignedToId: userId } : {};

  const leads = await prisma.lead.findMany({
    where: leadWhere,
    select: { id: true, customerName: true },
    orderBy: { createdAt: "desc" },
  });

  const lockedLeadId = leadId && leads.some((l) => l.id === leadId) ? leadId : undefined;

  return (
    <div className="space-y-6">
      <Link
        href={lockedLeadId ? `/leads/${lockedLeadId}` : "/surveys"}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="size-4" />
        {lockedLeadId ? "Back to lead" : "Back to surveys"}
      </Link>

      <PageHeader
        icon={ClipboardCheck}
        title="New site survey"
        description="Record the site conditions, load requirement and recommended system."
      />

      <Card className="max-w-3xl p-6">
        {leads.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="No leads to survey yet"
            description="Create a lead first, then capture its site survey."
            action={
              <Link href="/leads/new" className="btn btn-primary">
                Create a lead
              </Link>
            }
          />
        ) : (
          <NewSurveyForm leads={leads} lockedLeadId={lockedLeadId} />
        )}
      </Card>
    </div>
  );
}
