/** Rules and helpers for the emails employees send to leads from the CRM. Nothing here touches a mail server. */

export const MAX_RECIPIENTS = 10;
export const MAX_SUBJECT_LENGTH = 200;
export const MAX_BODY_LENGTH = 20_000;
/** All attachments together, before encoding. Mail servers refuse messages much larger than this. */
export const MAX_ATTACHMENT_BYTES = 7 * 1024 * 1024;
/** Emails one person may send per hour. */
export const EMAILS_PER_HOUR = 30;

const EMAIL =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL.test(value);
}

/** Splits "a@x.com, b@y.com; c@z.com" into the valid addresses (lower-cased, no duplicates) and the ones that are not. */
export function parseAddressList(raw: string | null | undefined): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const piece of (raw ?? "").split(/[\s,;]+/)) {
    const address = piece.replace(/^<|>$/g, "").trim();
    if (!address) continue;
    if (!isValidEmail(address)) {
      invalid.push(address);
      continue;
    }
    const lower = address.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      valid.push(lower);
    }
  }
  return { valid, invalid };
}

// Control characters, which have no place in a subject or a name and could be used to add headers to a message.
const CONTROL = /[\u0000-\u001F\u007F]/g;

/** One tidy line: no line breaks or control characters, single spaces, trimmed. */
export function cleanSubject(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
}

/** The message text with normal line endings and without control characters other than tab and newline. */
export function cleanBody(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return (
    raw
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text as a simple HTML email: escaped, line breaks kept, and web addresses made clickable. */
export function plainTextToHtml(text: string): string {
  const escaped = escapeHtml(text);
  const linked = escaped.replace(/https?:\/\/[^\s<]+/g, (match) => {
    // Keep sentence punctuation and a closing bracket outside the link.
    const trailing = /[.,;:!?)]+$/.exec(match)?.[0] ?? "";
    const url = trailing ? match.slice(0, -trailing.length) : match;
    return `<a href="${url}">${url}</a>${trailing}`;
  });
  const body = linked.replace(/\n/g, "<br>\n");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#1f2937">${body}</div>`;
}

export type SenderIdentity = { name: string; email: string; roleLabel: string };
export type CompanyIdentity = { name: string; phone?: string | null; website?: string | null };

/** The sign-off added under every email, so the customer always sees who wrote and from which company. */
export function buildSignature(sender: SenderIdentity, company: CompanyIdentity): string {
  const lines = ["Regards,", sender.name, `${sender.roleLabel} | ${company.name}`];
  if (company.phone) lines.push(`Phone: ${company.phone}`);
  if (company.website) lines.push(company.website);
  return lines.join("\n");
}

export type Mailbox = { name: string | null; address: string };

/** Reads `Name <a@b.com>` or a bare `a@b.com`; null when there is no usable address. */
export function parseMailbox(value: string | null | undefined): Mailbox | null {
  if (!value) return null;
  const withName = /^\s*"?([^"<]*?)"?\s*<([^<>\s]+)>\s*$/.exec(value);
  if (withName && isValidEmail(withName[2])) {
    return { name: withName[1].trim() || null, address: withName[2].toLowerCase() };
  }
  const bare = value.trim();
  return isValidEmail(bare) ? { name: null, address: bare.toLowerCase() } : null;
}

function domainOf(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase();
}

export type MailIdentity = { from: { name: string; address: string }; replyTo: string };

/**
 * Who the customer sees the email coming from. It is sent from the company's address (the one set for outgoing
 * mail) with the employee's name in front of it, and replies go to the employee. When `perEmployee` is on and the
 * employee's own address is on the same domain as the company address, it is sent from the employee's address.
 */
export function chooseSender(options: {
  configuredFrom: string | null | undefined;
  sender: { name: string; email: string };
  companyName: string;
  perEmployee: boolean;
}): MailIdentity {
  const { configuredFrom, sender, companyName, perEmployee } = options;
  const company = parseMailbox(configuredFrom) ?? { name: null, address: "no-reply@adreco.in" };
  const own = sender.email.trim().toLowerCase();
  const useOwn = perEmployee && isValidEmail(own) && domainOf(own) === domainOf(company.address);

  const displayName = `${sender.name} | ${companyName}`.replace(/["<>\r\n]/g, "").replace(/\s+/g, " ").trim();
  return {
    from: { name: displayName, address: useOwn ? own : company.address },
    replyTo: isValidEmail(own) ? own : company.address,
  };
}

/** Whether the files fit in one email. Returns a message when they do not. */
export function attachmentProblem(sizes: number[]): string | null {
  const total = sizes.reduce((sum, n) => sum + n, 0);
  if (total > MAX_ATTACHMENT_BYTES) {
    const mb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
    return `The attached files are too large to email together (limit ${mb} MB).`;
  }
  return null;
}
