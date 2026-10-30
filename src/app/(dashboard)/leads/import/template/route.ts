import { auth } from "@/auth";
import { toCsv } from "@/lib/csv";
import { IMPORT_TEMPLATE } from "@/lib/lead-import";

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if (session.user.role !== "ADMIN" && session.user.role !== "SALES") return new Response("Forbidden", { status: 403 });

  return new Response("﻿" + toCsv(IMPORT_TEMPLATE), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="adreco-leads-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
