/**
 * Zoho Chat & Zoho SalesIQ / Cliq Omnichannel Communication Suite
 *
 * Replaces WhatsApp with Zoho's native enterprise chat platform (Zoho SalesIQ & Zoho Cliq).
 * Supports:
 * 1. 1-Click Zoho Customer Chat launcher (Zoho SalesIQ / Cliq)
 * 2. Pre-configured Heat Pump templates for customer communication
 * 3. Automatic logging of Zoho chat interactions to Lead timeline & follow-up notes
 * 4. Zoho SalesIQ direct chat URLs and visitor channels
 */

export interface ZohoChatTemplateData {
  customerName: string;
  phone: string;
  email?: string | null;
  productCategory?: string | null;
  budget?: string | number | null;
  quoteNumber?: string | null;
  grandTotal?: string | number | null;
  surveyApplication?: string | null;
  customMessage?: string;
  senderName?: string;
}

export type ZohoChatTemplateId =
  | "lead_welcome"
  | "survey_schedule"
  | "quotation_share"
  | "proposal_followup"
  | "service_install"
  | "custom";

export interface ZohoChatTemplate {
  id: ZohoChatTemplateId;
  label: string;
  description: string;
  generateText: (data: ZohoChatTemplateData) => string;
}

export const ZOHO_CHAT_TEMPLATES: ZohoChatTemplate[] = [
  {
    id: "lead_welcome",
    label: "Zoho Welcome & Product Sizing",
    description: "Welcome enquiry via Zoho Chat and introduce Adreco heat pumps",
    generateText: (data) =>
      `Hello ${data.customerName || "Customer"},

Thank you for connecting with *Adreco Engineering Pvt Ltd* on Zoho Chat!

We are specialists in industrial, commercial and residential Heat Pump heating & hot water systems.

Could you please share your site location and current heating/hot water requirements? We will prepare a detailed engineering sizing and savings estimate for you.

Best regards,
${data.senderName ? `${data.senderName}\n` : ""}Adreco Engineering Pvt Ltd
🌐 https://adreco.in`,
  },
  {
    id: "survey_schedule",
    label: "Site Survey Appointment",
    description: "Confirm technical site survey via Zoho Chat",
    generateText: (data) =>
      `Dear ${data.customerName || "Customer"},

Greetings from Adreco Engineering!

Our technical engineer would like to schedule an on-site survey for your ${data.productCategory || data.surveyApplication || "Heat Pump"} requirement to inspect electrical supply, plumbing connections, and ambient conditions.

Please confirm a convenient date and time for our engineering visit.

Regards,
Adreco Technical Team`,
  },
  {
    id: "quotation_share",
    label: "Formal Quotation & Proposal",
    description: "Send proposal reference, total value and warranty terms",
    generateText: (data) =>
      `Dear ${data.customerName || "Customer"},

We are pleased to present our techno-commercial proposal:

📄 *Quote Ref:* ${data.quoteNumber || "ADR-QUOTE"}
💰 *Total Proposal Value:* ${typeof data.grandTotal === "number" ? `₹${data.grandTotal.toLocaleString("en-IN")}` : data.grandTotal || "As per proposal"}
⚡ *System:* ${data.productCategory || "High-Efficiency Commercial Heat Pump"}

Please review the proposal. You can reply directly here in Zoho Chat with any questions or modifications.

Best regards,
Adreco Sales & Engineering`,
  },
  {
    id: "proposal_followup",
    label: "Proposal Follow-up & ROI",
    description: "Follow up on shared quote with energy savings guidance",
    generateText: (data) =>
      `Hello ${data.customerName || "Customer"},

Following up on proposal ${data.quoteNumber ? `(*${data.quoteNumber}*)` : ""} shared with you.

Did you have an opportunity to review the energy savings analysis and payback period? Our lead engineer is available for a quick discussion on Zoho Chat or a phone call whenever convenient.

Warm regards,
Adreco Engineering`,
  },
  {
    id: "service_install",
    label: "Installation & Commissioning",
    description: "Update customer on installation readiness",
    generateText: (data) =>
      `Dear ${data.customerName || "Customer"},

Update on your Adreco Heat Pump installation:
Our field engineering team is scheduling your system installation. Please ensure 3-phase electrical load and water inlet/outlet points are ready.

Feel free to reply here on Zoho Chat for any site coordination.

Warm regards,
Adreco Installation & Service Team`,
  },
  {
    id: "custom",
    label: "Custom Zoho Message",
    description: "Compose a personalized message",
    generateText: (data) => data.customMessage || `Hello ${data.customerName || "Customer"}, greetings from Adreco Engineering on Zoho Chat!`,
  },
];

/**
 * Generate Zoho Chat link (Zoho SalesIQ / Zoho Cliq / Zoho Desk)
 */
export function buildZohoChatLink(params: {
  phone?: string;
  email?: string | null;
  customerName: string;
  portalDomain?: string;
}): string {
  const domain = params.portalDomain || process.env.NEXT_PUBLIC_ZOHO_CHAT_PORTAL || "https://salesiq.zoho.in";
  // If a specific Zoho SalesIQ portal or Cliq channel is configured:
  const encodedName = encodeURIComponent(params.customerName);
  const encodedEmail = params.email ? encodeURIComponent(params.email) : "";
  const encodedPhone = params.phone ? encodeURIComponent(params.phone) : "";

  return `${domain}?visitor_name=${encodedName}&visitor_email=${encodedEmail}&visitor_phone=${encodedPhone}`;
}
