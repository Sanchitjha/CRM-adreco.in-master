/**
 * A small client for Meta's official WhatsApp Business (Cloud) API, used to send the admin's daily update as an
 * approved template message. Nothing here logs in to anybody's WhatsApp: the company's WhatsApp Business number is
 * registered with Meta and the CRM sends through it with an access token. See DEPLOYMENT.md for the setup.
 */

const DEFAULT_API_VERSION = "v22.0";

/** True once the phone number id and access token have been set. */
export function isWhatsAppCloudConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

/**
 * A number as WhatsApp wants it: digits only, with the country code. Leading zeros (the trunk prefix, or the "00"
 * of an international call) are dropped, since no country code starts with 0, and ten-digit numbers are taken to
 * be Indian. Returns null when it cannot be a phone number.
 */
export function normalizeWhatsAppNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return digits;
  return null;
}

/** Template values may not hold line breaks, tabs or runs of spaces, and may not be empty. */
export function cleanTemplateParam(value: string): string {
  const flat = value.replace(/\s+/g, " ").trim().slice(0, 1000);
  return flat || "-";
}

export type TemplateMessage = {
  /** Digits with country code, as returned by normalizeWhatsAppNumber. */
  to: string;
  template: string;
  language: string;
  params: string[];
};

export function buildTemplatePayload(message: TemplateMessage) {
  return {
    messaging_product: "whatsapp",
    to: message.to,
    type: "template",
    template: {
      name: message.template,
      language: { code: message.language },
      components: [
        { type: "body", parameters: message.params.map((p) => ({ type: "text", text: cleanTemplateParam(p) })) },
      ],
    },
  };
}

/** What went wrong, from the API's own error, in one short line. The access token is never part of it. */
export function describeApiError(status: number, body: unknown): string {
  const error = (body as { error?: { message?: string; code?: number; error_data?: { details?: string } } } | null)?.error;
  const detail = error?.error_data?.details ?? error?.message;
  return `WhatsApp API error ${status}${error?.code ? ` (code ${error.code})` : ""}: ${detail ?? "no details given"}`.slice(0, 300);
}

/** Sends one template message. Throws with a readable message if WhatsApp refuses it. */
export async function sendWhatsAppTemplate(
  message: TemplateMessage,
  fetchImpl: typeof fetch = fetch,
): Promise<{ messageId: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !token) throw new Error("WhatsApp is not set up.");

  const version = process.env.WHATSAPP_API_VERSION || DEFAULT_API_VERSION;
  const response = await fetchImpl(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildTemplatePayload(message)),
    signal: AbortSignal.timeout(15_000),
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Not JSON: the status code below says enough.
  }
  if (!response.ok) throw new Error(describeApiError(response.status, body));

  const id = (body as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id;
  if (!id) throw new Error("WhatsApp accepted the request but returned no message id.");
  return { messageId: id };
}
