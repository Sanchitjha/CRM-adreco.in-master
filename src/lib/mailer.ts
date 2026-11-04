import nodemailer from "nodemailer";

const DEFAULT_FROM = "Adreco CRM <no-reply@adreco.in>";

/** Outgoing mail works once a mail server (SMTP_HOST) has been set up. */
export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

function getTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) throw new Error("SMTP_HOST is not configured.");

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    // A page waiting on a mail server that does not answer should give up, not hang.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });
}

export async function sendMail(to: string, subject: string, text: string) {
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM || DEFAULT_FROM,
    to,
    subject,
    text,
  });
}

export type OutgoingEmail = {
  from?: { name: string; address: string };
  replyTo?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer }[];
};

/** Sends one email, with an HTML version, a reply-to address and attachments when given. Returns the message id. */
export async function sendEmail(mail: OutgoingEmail): Promise<{ messageId: string }> {
  const transport = getTransport();
  const info = await transport.sendMail({
    from: mail.from ?? (process.env.SMTP_FROM || DEFAULT_FROM),
    replyTo: mail.replyTo,
    to: mail.to,
    cc: mail.cc?.length ? mail.cc : undefined,
    bcc: mail.bcc?.length ? mail.bcc : undefined,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: mail.attachments,
  });
  return { messageId: info.messageId };
}
