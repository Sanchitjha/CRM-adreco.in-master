/**
 * WhatsApp messages for clients: ready-made message templates and the one-tap WhatsApp link (wa.me), which needs no
 * account or key. Sending straight from the CRM through the WhatsApp Business API is not built yet.
 */

export interface WhatsAppTemplateData {
  customerName: string;
  phone: string;
  productCategory?: string | null;
  budget?: string | number | null;
  quoteNumber?: string | null;
  grandTotal?: string | number | null;
  surveyApplication?: string | null;
  customMessage?: string;
  senderName?: string;
}

export type WhatsAppTemplateId =
  | "lead_intro"
  | "survey_schedule"
  | "quotation_share"
  | "follow_up"
  | "service_ready"
  | "custom";

export interface WhatsAppTemplate {
  id: WhatsAppTemplateId;
  label: string;
  description: string;
  generateText: (data: WhatsAppTemplateData) => string;
}

/** Sanitize phone number to standard international format (defaults to +91 for India if 10 digits). */
export function formatWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length > 10 && !digits.startsWith("91")) return digits;
  return digits;
}

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: "lead_intro",
    label: "Introduction & Catalog",
    description: "Welcome new customer and share Adreco heat pump product overview",
    generateText: (data) =>
      `Hello ${data.customerName || "Customer"},

Thank you for your enquiry with *Adreco Engineering Pvt Ltd*!

We specialize in energy-efficient Heat Pump solutions (Commercial, Industrial & Residential Hot Water & HVAC).

Could you please share your site location and current heating/hot water requirement? We'll prepare a custom sizing analysis and proposal for you.

Best regards,
${data.senderName ? `${data.senderName}\n` : ""}Adreco Engineering Pvt Ltd
🌐 https://adreco.in`,
  },
  {
    id: "survey_schedule",
    label: "Site Survey Confirmation",
    description: "Confirm engineering technical site inspection",
    generateText: (data) =>
      `Dear ${data.customerName || "Customer"},

Greetings from Adreco Engineering!

Our technical engineer would like to schedule a quick on-site survey for your ${data.productCategory || data.surveyApplication || "Heat Pump"} requirement to assess electrical load, piping, and ambient specs.

Could you please confirm the best date & time for our visit?

Regards,
Adreco Engineering Team`,
  },
  {
    id: "quotation_share",
    label: "Quotation & Proposal",
    description: "Send formal proposal with quote reference and grand total",
    generateText: (data) =>
      `Dear ${data.customerName || "Customer"},

We are pleased to present our techno-commercial proposal for your requirement:

📄 *Quote Ref:* ${data.quoteNumber || "ADR-QUOTE"}
💰 *Total Value:* ${typeof data.grandTotal === "number" ? `₹${data.grandTotal.toLocaleString("en-IN")}` : data.grandTotal || "As per proposal"}
⚡ *System:* ${data.productCategory || "High-Efficiency Heat Pump"}

Please review the attached proposal. Feel free to message back here or call us for any queries or customized modifications.

Best regards,
${data.senderName ? `${data.senderName}\n` : ""}Adreco Engineering Pvt Ltd`,
  },
  {
    id: "follow_up",
    label: "Proposal Follow-up",
    description: "Follow up on shared quote or proposal with quick decision help",
    generateText: (data) =>
      `Hello ${data.customerName || "Customer"},

Following up on our proposal ${data.quoteNumber ? `(*${data.quoteNumber}*)` : ""} shared recently.

Have you had a chance to review the savings calculation and technical specifications? We would love to address any technical questions or arrange a call with our chief engineer.

Looking forward to your feedback!

Warm regards,
Adreco Engineering`,
  },
  {
    id: "service_ready",
    label: "Installation & Service",
    description: "Installation schedule or warranty/service status update",
    generateText: (data) =>
      `Dear ${data.customerName || "Customer"},

Update regarding your Adreco Heat Pump system:
Our Installation & Commissioning team is ready to proceed. Please ensure site readiness (3-phase electrical supply and plumbing inlet/outlet).

For any assistance, reply directly to this chat.

Warm regards,
Adreco Installation & Service Team`,
  },
  {
    id: "custom",
    label: "Custom Message",
    description: "Write your own personalized message",
    generateText: (data) => data.customMessage || `Hello ${data.customerName || "Customer"}, greetings from Adreco Engineering!`,
  },
];

/** Build direct WhatsApp Web / App link */
export function buildWhatsAppLink(phone: string, text: string): string {
  const cleanPhone = formatWhatsAppPhone(phone);
  const encoded = encodeURIComponent(text.trim());
  return `https://wa.me/${cleanPhone}?text=${encoded}`;
}

