export const MAX_CHAT_MESSAGE_LENGTH = 4000;

/** Messages a person may send per minute before being asked to slow down. */
export const CHAT_MESSAGES_PER_MINUTE = 30;

export type CleanedBody = { ok: true; body: string } | { ok: false; error: string };

// Control characters other than tab and newline, and the invisible marks that flip the direction of text (they can
// make a message read differently from how it was typed).
const UNWANTED = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g;

/** Tidies what a person typed into a message body, or says why it cannot be sent. */
export function cleanChatBody(raw: unknown): CleanedBody {
  if (typeof raw !== "string") return { ok: false, error: "Write a message first." };
  const body = raw.replace(/\r\n?/g, "\n").replace(UNWANTED, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!body) return { ok: false, error: "Write a message first." };
  if (body.length > MAX_CHAT_MESSAGE_LENGTH) {
    return { ok: false, error: `Messages can be up to ${MAX_CHAT_MESSAGE_LENGTH} characters.` };
  }
  return { ok: true, body };
}

/** A single short line for conversation lists. */
export function chatPreview(body: string, max = 70): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
