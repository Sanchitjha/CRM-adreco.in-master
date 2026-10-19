"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { canAccessSurveys } from "@/lib/rbac";
import type { ActionState } from "@/lib/action-state";
import { createSurveySchema, updateSurveyStatusSchema } from "@/lib/validation/survey";

function firstIssueMessage(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Invalid input";
}

function intOrNull(v: number | "" | undefined): number | null {
  return v === "" || v === undefined ? null : v;
}

/** ADMIN & DESIGN can survey any lead; SALES only leads assigned to them. */
async function canSurveyLead(leadId: string, userId: string, role: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { assignedToId: true } });
  if (!lead) return false;
  if (role === "ADMIN" || role === "DESIGN") return true;
  if (role === "SALES") return lead.assignedToId === userId;
  return false;
}

export async function createSurvey(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canAccessSurveys(session.user.role)) {
    return { error: "You do not have permission to create site surveys." };
  }

  const parsed = createSurveySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const data = parsed.data;

  if (!(await canSurveyLead(data.leadId, session.user.id, session.user.role))) {
    return { error: "You do not have access to that lead." };
  }

  const survey = await prisma.siteSurvey.create({
    data: {
      leadId: data.leadId,
      surveyedById: session.user.id,
      application: data.application,
      siteAddress: data.siteAddress || null,
      ambientTempC: intOrNull(data.ambientTempC),
      requiredTempC: intOrNull(data.requiredTempC),
      dailyDemandL: intOrNull(data.dailyDemandL),
      peakHourL: intOrNull(data.peakHourL),
      numberOfUsers: intOrNull(data.numberOfUsers),
      poolSize: data.poolSize || null,
      existingSystem: data.existingSystem || null,
      electricalSupply: data.electricalSupply || null,
      installLocation: data.installLocation || null,
      pipingDetails: data.pipingDetails || null,
      storageTank: data.storageTank || null,
      recommendedModel: data.recommendedModel || null,
      recommendedCapacityKw: intOrNull(data.recommendedCapacityKw),
      recommendedQty: intOrNull(data.recommendedQty),
      engineerRemarks: data.engineerRemarks || null,
    },
  });

  await logActivity({
    userId: session.user.id,
    action: "SURVEY_CREATED",
    entityType: "SiteSurvey",
    entityId: survey.id,
    details: { leadId: data.leadId, application: data.application },
  });

  revalidatePath("/surveys");
  revalidatePath(`/leads/${data.leadId}`);
  redirect(`/surveys/${survey.id}`);
}

export async function updateSurveyStatus(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canAccessSurveys(session.user.role)) {
    return { error: "You do not have permission to update surveys." };
  }

  const parsed = updateSurveyStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const data = parsed.data;

  const survey = await prisma.siteSurvey.findUnique({
    where: { id: data.surveyId },
    select: { leadId: true, surveyedById: true, status: true },
  });
  if (!survey) return { error: "Survey not found." };

  // SALES can only change their own surveys; ADMIN/DESIGN can change any.
  if (session.user.role === "SALES" && survey.surveyedById !== session.user.id) {
    return { error: "You can only update surveys you created." };
  }

  await prisma.siteSurvey.update({
    where: { id: data.surveyId },
    data: { status: data.status },
  });

  await logActivity({
    userId: session.user.id,
    action: "SURVEY_STATUS_CHANGED",
    entityType: "SiteSurvey",
    entityId: data.surveyId,
    details: { from: survey.status, to: data.status },
  });

  revalidatePath(`/surveys/${data.surveyId}`);
  revalidatePath("/surveys");
  revalidatePath(`/leads/${survey.leadId}`);
  return {};
}
