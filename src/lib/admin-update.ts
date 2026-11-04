import { prisma } from "@/lib/db";
import { dailyUpdateRecipients } from "@/lib/admin-recipients";
import { isMailConfigured, sendEmail } from "@/lib/mailer";
import {
  renderReportHtml,
  renderReportText,
  reportSubject,
  whatsappReportParams,
  type ReportKind,
} from "@/lib/team-report";
import { loadTeamReport } from "@/lib/team-report-data";
import { isWhatsAppCloudConfigured, normalizeWhatsAppNumber, sendWhatsAppTemplate } from "@/lib/whatsapp-cloud";

/** The address people use to reach the CRM, for the links in the update. Without one the links are left out. */
export function appBaseUrl(): string {
  return (process.env.APP_URL || process.env.AUTH_URL || "").trim().replace(/\/+$/, "");
}

export type AdminUpdateResult = {
  recipients: number;
  emailsSent: number;
  whatsappSent: number;
  /** Things that did not happen and why, in plain words. */
  notes: string[];
};

function short(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").slice(0, 200);
}

/**
 * Sends the daily update to the administrators who have it switched on: an email, and a WhatsApp message to each
 * one who has a number saved. Whichever of the two is not set up yet is skipped and mentioned in `notes`; one
 * failing never stops the other. `onlyUserId` sends it to one admin only, whatever their switch says, for the
 * "send me a test" button.
 */
export async function sendAdminDailyUpdate(options: {
  kind: ReportKind;
  onlyUserId?: string;
  now?: Date;
}): Promise<AdminUpdateResult> {
  const admins = await prisma.user.findMany({
    where: dailyUpdateRecipients(options.onlyUserId),
    select: { name: true, email: true, whatsappNumber: true },
  });
  const result: AdminUpdateResult = { recipients: admins.length, emailsSent: 0, whatsappSent: 0, notes: [] };
  if (admins.length === 0) {
    result.notes.push(
      options.onlyUserId
        ? "That administrator account is not available."
        : "No administrator is set to receive the daily update (see Settings).",
    );
    return result;
  }

  const mailReady = isMailConfigured();
  const whatsappReady = isWhatsAppCloudConfigured();
  if (!mailReady) result.notes.push("Email is not set up yet (no mail server).");
  if (!whatsappReady) result.notes.push("WhatsApp is not set up yet (no WhatsApp Business API settings).");
  if (!mailReady && !whatsappReady) return result;

  const report = await loadTeamReport(options.kind, options.now);
  const baseUrl = appBaseUrl();

  for (const admin of admins) {
    if (mailReady) {
      try {
        await sendEmail({
          to: [admin.email],
          subject: reportSubject(report),
          text: renderReportText(report, baseUrl),
          html: renderReportHtml(report, baseUrl),
        });
        result.emailsSent += 1;
      } catch (error) {
        result.notes.push(`The email to ${admin.email} failed: ${short(error)}`);
      }
    }

    if (whatsappReady) {
      if (!admin.whatsappNumber) {
        result.notes.push(`${admin.name} has no WhatsApp number saved.`);
        continue;
      }
      const to = normalizeWhatsAppNumber(admin.whatsappNumber);
      if (!to) {
        result.notes.push(`${admin.name}'s WhatsApp number is not a valid number.`);
        continue;
      }
      try {
        await sendWhatsAppTemplate({
          to,
          template: process.env.WHATSAPP_REPORT_TEMPLATE || "daily_crm_update",
          language: process.env.WHATSAPP_REPORT_LANGUAGE || "en",
          params: whatsappReportParams(report, baseUrl),
        });
        result.whatsappSent += 1;
      } catch (error) {
        result.notes.push(`The WhatsApp message to ${admin.name} failed: ${short(error)}`);
      }
    }
  }

  return result;
}
