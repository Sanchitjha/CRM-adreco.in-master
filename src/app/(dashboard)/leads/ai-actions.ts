"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { ActionState } from "@/lib/action-state";
import { canOpenLead } from "@/lib/chat-access";
import { isAiConfigured, isClosedStatus, toLeadForAi } from "@/lib/ai";
import { getLeadAdvice } from "@/lib/ai-insight";

/** Asks the AI for fresh advice on one lead, for the Refresh button on the lead page. */
export async function refreshLeadAdvice(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Please sign in again." };
  const viewer = { id: session.user.id, role: session.user.role };

  const leadId = String(formData.get("leadId") ?? "");
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      currentDepartment: { select: { name: true } },
      followUps: { orderBy: { followUpDate: "desc" }, select: { followUpDate: true } },
      siteSurveys: { select: { id: true } },
      quotations: { orderBy: { createdAt: "desc" }, select: { grandTotal: true } },
    },
  });
  if (
    !lead ||
    !canOpenLead(viewer, { assignedToId: lead.assignedToId, currentDepartmentName: lead.currentDepartment?.name ?? null })
  ) {
    return { error: "You do not have access to this lead." };
  }

  if (!isAiConfigured()) return { error: "The AI is not switched on, so the built-in advice is shown." };
  if (isClosedStatus(lead.status)) return { error: "Won and lost leads use the built-in advice." };

  const outcome = await getLeadAdvice(toLeadForAi(lead), { refresh: true });
  revalidatePath(`/leads/${lead.id}`);

  if (outcome.kind === "failed") {
    const friendly = "The AI did not answer just now. Please try again in a minute.";
    // The technical reason (an expired key, a retired model) is for the people who can fix it.
    return { error: viewer.role === "ADMIN" ? `${friendly} ${outcome.reason}` : friendly };
  }
  if (outcome.kind === "cached") return { message: "The advice is already up to date." };
  return { message: "The advice is updated." };
}
