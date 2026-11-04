"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import type { ActionState } from "@/lib/action-state";
import { sendAdminDailyUpdate } from "@/lib/admin-update";
import { normalizeWhatsAppNumber } from "@/lib/whatsapp-cloud";

/**
 * Saves, for one administrator, whether they are sent the daily update and the WhatsApp number it goes to. Any
 * administrator can do this for any other, so whoever sets the system up can enter the owner's number for them.
 */
export async function saveAdminDailyUpdate(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return { error: "Only administrators can change this." };

  const userId = String(formData.get("userId") ?? "");
  const admin = await prisma.user.findFirst({ where: { id: userId, role: "ADMIN", active: true }, select: { id: true } });
  if (!admin) return { error: "That administrator was not found." };

  // A ticked box is sent as "on"; an unticked one is not sent at all.
  const receives = formData.get("receivesDailyUpdate") === "on";

  const raw = String(formData.get("whatsappNumber") ?? "").trim();
  let number: string | null = null;
  if (raw) {
    number = normalizeWhatsAppNumber(raw);
    if (!number) {
      return { error: "That does not look like a phone number. Write it with its country code, for example +91 98765 43210." };
    }
  }

  await prisma.user.update({ where: { id: admin.id }, data: { whatsappNumber: number, receivesDailyUpdate: receives } });
  await logActivity({
    userId: session.user.id,
    action: "DAILY_UPDATE_SETTINGS_SAVED",
    entityType: "User",
    entityId: admin.id,
    details: { receives, hasNumber: number !== null },
  });

  revalidatePath("/settings");

  if (!receives) {
    return {
      message: number
        ? `Saved. This administrator will not get the daily update. The number +${number} is kept for when it is switched back on.`
        : "Saved. This administrator will not get the daily update.",
    };
  }
  return {
    message: number
      ? `Saved. The daily update goes to this administrator's email and to +${number} on WhatsApp.`
      : "Saved. The daily update goes to this administrator's email. Add a WhatsApp number to send it there too.",
  };
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
