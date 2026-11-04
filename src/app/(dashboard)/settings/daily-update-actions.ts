"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import type { ActionState } from "@/lib/action-state";
import { sendAdminDailyUpdate } from "@/lib/admin-update";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp-cloud";

/** Saves (or clears) the WhatsApp number that gets the daily update for one administrator. */
export async function saveAdminWhatsApp(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return { error: "Only administrators can change this." };

  const userId = String(formData.get("userId") ?? "");
  const admin = await prisma.user.findFirst({ where: { id: userId, role: "ADMIN", active: true }, select: { id: true } });
  if (!admin) return { error: "That administrator was not found." };

  const raw = String(formData.get("whatsappNumber") ?? "").trim();
  let number: string | null = null;
  if (raw) {
    number = normalizeWhatsAppNumber(raw);
    if (!number) {
      return { error: "That does not look like a phone number. Write it with its country code, for example +91 98765 43210." };
    }
  }

  await prisma.user.update({ where: { id: admin.id }, data: { whatsappNumber: number } });
  await logActivity({
    userId: session.user.id,
    action: "DAILY_UPDATE_NUMBER_SAVED",
    entityType: "User",
    entityId: admin.id,
    details: { cleared: number === null },
  });

  revalidatePath("/settings");
  return { message: number ? `Saved. The daily update will go to +${number}.` : "Removed. This administrator will not get the update on WhatsApp." };
}

/** Sends today's update to the administrator who pressed the button, so email and WhatsApp can be checked. */
export async function sendDailyUpdateNow(): Promise<ActionState> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return { error: "Only administrators can do this." };

  const recent = await prisma.activityLog.count({
    where: { userId: session.user.id, action: "DAILY_UPDATE_TEST_SENT", createdAt: { gt: new Date(Date.now() - 60_000) } },
  });
  if (recent > 0) return { error: "You sent one a moment ago. Please wait a minute before sending another." };

  const result = await sendAdminDailyUpdate({ kind: "today", onlyUserId: session.user.id });
  await logActivity({
    userId: session.user.id,
    action: "DAILY_UPDATE_TEST_SENT",
    entityType: "User",
    entityId: session.user.id,
    details: { emails: result.emailsSent, whatsapp: result.whatsappSent },
  });

  const sent: string[] = [];
  if (result.emailsSent > 0) sent.push("The email is on its way to your address.");
  if (result.whatsappSent > 0) sent.push("The WhatsApp message is on its way to your number.");
  const notes = result.notes.join(" ");

  if (sent.length === 0) return { error: `Nothing was sent. ${notes}`.trim() };
  return { message: `${sent.join(" ")} ${notes}`.trim() };
}
