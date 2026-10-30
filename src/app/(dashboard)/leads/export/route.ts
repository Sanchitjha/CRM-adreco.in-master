import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { toCsv } from "@/lib/csv";
import { formatDate, toDateInput } from "@/lib/dates";
import { leadScope } from "@/lib/scope";
import { STATUS_LABELS } from "@/components/status-badge";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  const { role, id: userId } = session.user;
  if (role !== "ADMIN" && role !== "SALES") return new Response("Forbidden", { status: 403 });

  // Same search box as the leads list, so "export what I'm looking at" works.
  const q = new URL(request.url).searchParams.get("q")?.trim();
  const search: Prisma.LeadWhereInput = q
    ? {
        OR: [
          { customerName: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const leads = await prisma.lead.findMany({
    where: { AND: [leadScope(role, userId), search] },
    include: {
      assignedTo: { select: { name: true } },
      dealer: { select: { name: true } },
      followUps: { select: { followUpDate: true, nextFollowUpDate: true }, orderBy: { followUpDate: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: unknown[][] = [
    [
      "Customer name", "Phone", "Email", "Address", "Product category", "Budget", "Source", "Status",
      "Owner", "Dealer", "Created on", "Last follow-up", "Next follow-up", "Requirement notes",
    ],
    ...leads.map((l) => [
      l.customerName,
      l.phone,
      l.email,
      l.address,
      l.productCategory,
      l.budget === null ? null : Number(l.budget),
      l.source,
      STATUS_LABELS[l.status],
      l.assignedTo?.name,
      l.dealer?.name,
      formatDate(l.createdAt),
      l.followUps[0] ? formatDate(l.followUps[0].followUpDate) : null,
      l.followUps[0]?.nextFollowUpDate ? formatDate(l.followUps[0].nextFollowUpDate) : null,
      l.requirementNotes,
    ]),
  ];

  await logActivity({
    userId,
    action: "LEADS_EXPORTED",
    entityType: "Lead",
    entityId: "export",
    details: { count: leads.length, search: q ?? null },
  });

  return new Response("﻿" + toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="adreco-leads-${toDateInput(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
