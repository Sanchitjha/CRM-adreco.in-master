"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import type { ActionState } from "@/lib/action-state";
import { canOpenLead } from "@/lib/chat-access";
import {
  EMAILS_PER_HOUR,
  MAX_ATTACHMENT_BYTES,
  MAX_BODY_LENGTH,
  MAX_RECIPIENTS,
  MAX_SUBJECT_LENGTH,
  attachmentProblem,
  buildSignature,
  chooseSender,
  cleanBody,
  cleanSubject,
  parseAddressList,
  plainTextToHtml,
} from "@/lib/email-compose";
import { isMailConfigured, sendEmail } from "@/lib/mailer";
import { ROLE_LABELS } from "@/lib/rbac";
import { getObjectBytes } from "@/lib/s3";
import { getCompanyProfile } from "@/lib/settings";

const FALLBACK_COMPANY = "Adreco Engineering Pvt Ltd";

function failureText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/\s+/g, " ").slice(0, 300);
}

/**
 * Sends an email to a lead's contacts from the company's address, keeps a copy on the lead and records it as a
 * follow-up, so the whole team can see what the customer was told.
 */
export async function sendLeadEmail(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const session = await auth();
  if (!session?.user) return { error: "Please sign in again." };
  const viewer = { id: session.user.id, role: session.user.role };

  const leadId = String(formData.get("leadId") ?? "");
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      contacts: { select: { email: true } },
      documents: { select: { id: true, fileName: true, s3Key: true } },
      currentDepartment: { select: { name: true } },
      followUps: { orderBy: { followUpDate: "desc" }, take: 1, select: { nextFollowUpDate: true } },
    },
  });
  if (
    !lead ||
    !canOpenLead(viewer, { assignedToId: lead.assignedToId, currentDepartmentName: lead.currentDepartment?.name ?? null })
  ) {
    return { error: "You do not have access to this lead." };
  }

  if (!isMailConfigured()) {
    return { error: "Email is not set up yet. An administrator needs to add the mail server settings (see DEPLOYMENT.md)." };
  }

  // Who it goes to: addresses ticked from the lead and its contacts, plus any typed in.
  const known = new Set([lead.email, ...lead.contacts.map((c) => c.email)].filter(Boolean).map((e) => e!.toLowerCase()));
  const ticked = formData
    .getAll("to")
    .map((v) => String(v).trim().toLowerCase())
    .filter((address) => known.has(address));
  const extra = parseAddressList(String(formData.get("toExtra") ?? ""));
  const cc = parseAddressList(String(formData.get("cc") ?? ""));
  const unreadable = [...extra.invalid, ...cc.invalid];
  if (unreadable.length > 0) return { error: `These do not look like email addresses: ${unreadable.join(", ")}.` };

  const to = [...new Set([...ticked, ...extra.valid])];
  const ccOnly = cc.valid.filter((address) => !to.includes(address));
  if (to.length === 0) return { error: "Choose at least one person to send it to." };
  if (to.length + ccOnly.length > MAX_RECIPIENTS) {
    return { error: `You can send an email to at most ${MAX_RECIPIENTS} people at a time.` };
  }

  const subject = cleanSubject(formData.get("subject"));
  if (!subject) return { error: "Write a subject." };
  if (subject.length > MAX_SUBJECT_LENGTH) return { error: `The subject can be up to ${MAX_SUBJECT_LENGTH} characters.` };

  const body = cleanBody(formData.get("body"));
  if (!body) return { error: "Write the message." };
  if (body.length > MAX_BODY_LENGTH) return { error: `The message can be up to ${MAX_BODY_LENGTH} characters.` };

  const sentLastHour = await prisma.leadEmail.count({
    where: { sentById: viewer.id, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
  });
  if (sentLastHour >= EMAILS_PER_HOUR) {
    return { error: `You have sent ${EMAILS_PER_HOUR} emails in the last hour. Please wait a little before sending more.` };
  }

  // Files from the lead's documents.
  const wanted = new Set(formData.getAll("attach").map(String));
  const documents = lead.documents.filter((d) => wanted.has(d.id) && d.s3Key && d.fileName);
  const attachments: { filename: string; content: Buffer }[] = [];
  if (documents.length > 0) {
    try {
      for (const document of documents) {
        attachments.push({ filename: document.fileName!, content: await getObjectBytes(document.s3Key!, MAX_ATTACHMENT_BYTES) });
      }
    } catch (error) {
      return { error: `The files could not be attached. ${failureText(error)}` };
    }
    const tooLarge = attachmentProblem(attachments.map((a) => a.content.byteLength));
    if (tooLarge) return { error: tooLarge };
  }

  const [sender, profile] = await Promise.all([
    prisma.user.findUnique({ where: { id: viewer.id }, select: { name: true, email: true, role: true } }),
    getCompanyProfile(),
  ]);
  if (!sender) return { error: "Please sign in again." };

  const companyName = profile?.tradeName || profile?.legalName || FALLBACK_COMPANY;
  const identity = chooseSender({
    configuredFrom: process.env.SMTP_FROM,
    sender,
    companyName,
    perEmployee: process.env.MAIL_FROM_EMPLOYEE === "true",
  });
  const signature = buildSignature(
    { name: sender.name, email: sender.email, roleLabel: ROLE_LABELS[sender.role] },
    { name: companyName, phone: profile?.phone, website: profile?.website },
  );
  const text = `${body}\n\n${signature}`;

  // Copies: the sender (if ticked) and the company's archive address (if one is set).
  const bcc = new Set(parseAddressList(process.env.MAIL_ARCHIVE_BCC).valid);
  if (formData.get("copyMe") === "on") bcc.add(sender.email.toLowerCase());
  for (const address of [...to, ...ccOnly]) bcc.delete(address);

  let status: "SENT" | "FAILED" = "SENT";
  let failure: string | null = null;
  try {
    await sendEmail({
      from: identity.from,
      replyTo: identity.replyTo,
      to,
      cc: ccOnly,
      bcc: [...bcc],
      subject,
      text,
      html: plainTextToHtml(text),
      attachments,
    });
  } catch (error) {
    status = "FAILED";
    failure = failureText(error);
  }

  await prisma.leadEmail.create({
    data: {
      leadId: lead.id,
      sentById: viewer.id,
      toAddresses: to.join(", "),
      ccAddresses: ccOnly.length ? ccOnly.join(", ") : null,
      subject,
      body,
      attachments: attachments.map((a) => a.filename),
      status,
      error: failure,
    },
  });

  if (status === "SENT") {
    // A follow-up in the lead's history, so the lead counts as contacted. The date of the next planned follow-up
    // is carried over, so sending an email does not clear it.
    await prisma.followUp.create({
      data: {
        leadId: lead.id,
        userId: viewer.id,
        note: `[Email] ${subject}`,
        outcome: "Email sent",
        nextFollowUpDate: lead.followUps[0]?.nextFollowUpDate ?? null,
      },
    });
    await logActivity({
      userId: viewer.id,
      action: "LEAD_EMAIL_SENT",
      entityType: "Lead",
      entityId: lead.id,
      details: { recipients: to.length + ccOnly.length, attachments: attachments.length, subject },
    });
  }

  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/leads");

  if (status === "FAILED") return { error: `The email could not be sent. ${failure}` };
  return { message: `Email sent to ${to.join(", ")}.` };
}
