import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { findDuplicateLeads } from "@/lib/lead-dedupe";

/** Constant-time comparison, so response timing can't be used to guess the secret one character at a time. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Inbound Webhook from Zoho CRM / Zoho Forms / Zoho Desk
 * Automatically captures incoming enquiries into Adreco CRM
 */
export async function POST(req: Request) {
  // This endpoint is reachable without signing in, so it refuses everything until a secret is configured.
  const configuredSecret = process.env.ZOHO_WEBHOOK_SECRET;
  if (!configuredSecret || !secretMatches(req.headers.get("x-zoho-secret"), configuredSecret)) {
    return NextResponse.json({ error: "Unauthorized Zoho Webhook" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Extract fields from Zoho standard payload format
    const customerName =
      body.Full_Name ||
      `${body.First_Name || ""} ${body.Last_Name || ""}`.trim() ||
      body.customerName ||
      "Zoho Webhook Lead";

    const phone = String(body.Phone || body.Mobile || body.phone || "").trim();
    const email = body.Email || body.email || null;
    const productCategory = body.Product_Category || body.productCategory || "Heat Pump";
    const requirementNotes = body.Description || body.notes || body.requirementNotes || null;
    const source = body.Lead_Source || body.source || "Zoho CRM";
    const budget = body.Budget || body.Amount ? String(body.Budget || body.Amount) : null;

    if (!phone) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    // Webhooks are retried and forms get submitted twice, so an enquiry we already hold is acknowledged, not duplicated.
    const [existing] = await findDuplicateLeads(phone, email);
    if (existing) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        leadId: existing.id,
        message: `${customerName} is already in the CRM; no new lead was created.`,
      });
    }

    // Find default admin or sales user to assign as creator
    const defaultUser = await prisma.user.findFirst({
      where: { role: "ADMIN", active: true },
      select: { id: true },
    });

    if (!defaultUser) {
      return NextResponse.json({ error: "No active admin user found to assign lead" }, { status: 500 });
    }

    const lead = await prisma.lead.create({
      data: {
        customerName,
        phone,
        email,
        productCategory,
        requirementNotes,
        source,
        budget: budget ? Number(budget) : null,
        createdById: defaultUser.id,
      },
    });

    await logActivity({
      userId: defaultUser.id,
      action: "LEAD_CREATED_VIA_ZOHO_WEBHOOK",
      entityType: "Lead",
      entityId: lead.id,
      details: { source: "Zoho Webhook", originalData: body },
    });

    return NextResponse.json({
      success: true,
      leadId: lead.id,
      message: `Lead ${customerName} ingested successfully from Zoho.`,
    });
  } catch (error: unknown) {
    console.error("Zoho webhook error:", error);
    return NextResponse.json({ error: "Could not process the webhook payload." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    endpoint: "/api/integrations/zoho/webhook",
    service: "Adreco CRM Zoho Bridge",
  });
}
