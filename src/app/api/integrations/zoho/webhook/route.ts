import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";

/**
 * Inbound Webhook from Zoho CRM / Zoho Forms / Zoho Desk
 * Automatically captures incoming enquiries into Adreco CRM
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Verify secret if set
    const configuredSecret = process.env.ZOHO_WEBHOOK_SECRET;
    const incomingSecret = req.headers.get("x-zoho-secret");
    if (configuredSecret && incomingSecret !== configuredSecret) {
      return NextResponse.json({ error: "Unauthorized Zoho Webhook" }, { status: 401 });
    }

    // Extract fields from Zoho standard payload format
    const customerName =
      body.Full_Name ||
      `${body.First_Name || ""} ${body.Last_Name || ""}`.trim() ||
      body.customerName ||
      "Zoho Webhook Lead";

    const phone = body.Phone || body.Mobile || body.phone || "";
    const email = body.Email || body.email || null;
    const productCategory = body.Product_Category || body.productCategory || "Heat Pump";
    const requirementNotes = body.Description || body.notes || body.requirementNotes || null;
    const source = body.Lead_Source || body.source || "Zoho CRM";
    const budget = body.Budget || body.Amount ? String(body.Budget || body.Amount) : null;

    if (!phone) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
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
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Zoho webhook error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    endpoint: "/api/integrations/zoho/webhook",
    service: "Adreco CRM Zoho Bridge",
  });
}
