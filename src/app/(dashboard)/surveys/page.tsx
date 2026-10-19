import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { ClipboardCheck, Plus } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canAccessSurveys } from "@/lib/rbac";
import { PageHeader, Card, EmptyState, Avatar } from "@/components/ui";
import { SurveyStatusBadge } from "@/components/surveys/survey-status-badge";

export default async function SurveysPage() {
  const session = await auth();
  const { role, id: userId } = session!.user;
  if (!canAccessSurveys(role)) redirect("/");

  // SALES sees surveys they ran or on leads assigned to them; ADMIN/DESIGN see all.
  const where: Prisma.SiteSurveyWhereInput =
    role === "SALES"
      ? { OR: [{ surveyedById: userId }, { lead: { assignedToId: userId } }] }
      : {};

  const surveys = await prisma.siteSurvey.findMany({
    where,
    include: { lead: true, surveyedBy: true },
    orderBy: { surveyDate: "desc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ClipboardCheck}
        title="Site surveys"
        description="Technical requirements captured on-site, tied to each lead."
        actions={
          <Link href="/surveys/new" className="btn btn-primary">
            <Plus className="size-4" />
            New survey
          </Link>
        }
      />

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-slate-50/70 text-left">
                <th className="px-5 py-3 font-medium text-slate-500">Customer</th>
                <th className="px-5 py-3 font-medium text-slate-500">Application</th>
                <th className="px-5 py-3 font-medium text-slate-500">Recommended</th>
                <th className="px-5 py-3 font-medium text-slate-500">Status</th>
                <th className="px-5 py-3 font-medium text-slate-500">Surveyed by</th>
                <th className="px-5 py-3 text-right font-medium text-slate-500">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {surveys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-0">
                    <EmptyState
                      icon={ClipboardCheck}
                      title="No surveys yet"
                      description="Capture a site survey to turn a lead into a technical requirement."
                    />
                  </td>
                </tr>
              ) : (
                surveys.map((s) => {
                  const rec = s.recommendedModel
                    ? `${s.recommendedModel}${s.recommendedCapacityKw ? ` · ${s.recommendedCapacityKw} kW` : ""}${
                        s.recommendedQty ? ` × ${s.recommendedQty}` : ""
                      }`
                    : "—";
                  return (
                    <tr key={s.id} className="transition hover:bg-slate-50/70">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={s.lead.customerName} />
                          <Link href={`/surveys/${s.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                            {s.lead.customerName}
                          </Link>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{s.application}</td>
                      <td className="px-5 py-3 text-slate-600">{rec}</td>
                      <td className="px-5 py-3">
                        <SurveyStatusBadge status={s.status} />
                      </td>
                      <td className="px-5 py-3 text-slate-600">{s.surveyedBy.name}</td>
                      <td className="px-5 py-3 text-right text-slate-400">
                        {s.surveyDate.toLocaleDateString("en-IN")}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
