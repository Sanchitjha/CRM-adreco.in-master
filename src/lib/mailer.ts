import nodemailer from "nodemailer";

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
  });
}

export async function sendMail(to: string, subject: string, text: string) {
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.SMTP_FROM || "Adreco CRM <no-reply@adreco.in>",
    to,
    subject,
    text,
  });
}
