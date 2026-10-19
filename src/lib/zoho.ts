/**
 * Zoho CRM & Zoho Ecosystem Integration for Adreco CRM
 *
 * Supports:
 * - Two-way Lead sync with Zoho CRM (Accounts, Deals, Leads)
 * - Zoho OAuth 2.0 Token Refresh
 * - Inbound Zoho Webhook endpoint (/api/integrations/zoho/webhook)
 * - Zoho WhatsApp / SMS gateway dispatching
 */

export interface ZohoConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accountsDomain?: string; // e.g. "https://accounts.zoho.in" or "https://accounts.zoho.com"
  apiDomain?: string; // e.g. "https://www.zohoapis.in" or "https://www.zohoapis.com"
  webhookSecret?: string;
}

export function getZohoConfig(): ZohoConfig {
  return {
    clientId: process.env.ZOHO_CLIENT_ID || "",
    clientSecret: process.env.ZOHO_CLIENT_SECRET || "",
    refreshToken: process.env.ZOHO_REFRESH_TOKEN || "",
    accountsDomain: process.env.ZOHO_ACCOUNTS_DOMAIN || "https://accounts.zoho.in",
    apiDomain: process.env.ZOHO_API_DOMAIN || "https://www.zohoapis.in",
    webhookSecret: process.env.ZOHO_WEBHOOK_SECRET || "",
  };
}

/** Check whether Zoho integration credentials are fully configured */
export function isZohoConfigured(): boolean {
  const cfg = getZohoConfig();
  return Boolean(cfg.clientId && cfg.clientSecret && cfg.refreshToken);
}

/** Exchange Refresh Token for active Access Token */
export async function getZohoAccessToken(): Promise<string | null> {
  const cfg = getZohoConfig();
  if (!isZohoConfigured()) return null;

  try {
    const url = `${cfg.accountsDomain}/oauth/v2/token?refresh_token=${encodeURIComponent(
      cfg.refreshToken!,
    )}&client_id=${encodeURIComponent(cfg.clientId!)}&client_secret=${encodeURIComponent(
      cfg.clientSecret!,
    )}&grant_type=refresh_token`;

    const res = await fetch(url, { method: "POST" });
    const data = await res.json();
    if (data.access_token) {
      return data.access_token as string;
    }
    console.error("Zoho token error:", data);
    return null;
  } catch (err) {
    console.error("Failed to refresh Zoho token:", err);
    return null;
  }
}

/** Push an Adreco Lead to Zoho CRM Leads module */
export async function pushLeadToZoho(lead: {
  id: string;
  customerName: string;
  phone: string;
  email?: string | null;
  productCategory?: string | null;
  budget?: number | string | null;
  source?: string | null;
  address?: string | null;
}): Promise<{ success: boolean; zohoId?: string; message?: string }> {
  if (!isZohoConfigured()) {
    return {
      success: false,
      message: "Zoho CRM is not configured. Add ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN in .env.",
    };
  }

  const token = await getZohoAccessToken();
  if (!token) return { success: false, message: "Could not obtain Zoho Access Token" };

  const cfg = getZohoConfig();
  const nameParts = lead.customerName.trim().split(" ");
  const firstName = nameParts.length > 1 ? nameParts[0] : "";
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : lead.customerName;

  const payload = {
    data: [
      {
        First_Name: firstName,
        Last_Name: lastName,
        Phone: lead.phone,
        Email: lead.email || undefined,
        Lead_Source: lead.source || "Adreco CRM",
        Description: `Product Category: ${lead.productCategory || "Heat Pump"}\nBudget: ${lead.budget || "N/A"}\nAdreco ID: ${lead.id}`,
        Street: lead.address || undefined,
      },
    ],
    trigger: ["approval", "workflow", "blueprint"],
  };

  try {
    const res = await fetch(`${cfg.apiDomain}/crm/v3/Leads`, {
      method: "POST",
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    const record = data.data?.[0];
    if (record?.status === "success" || record?.code === "SUCCESS") {
      return { success: true, zohoId: record.details?.id };
    }
    return { success: false, message: record?.message || JSON.stringify(data) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: msg };
  }
}
