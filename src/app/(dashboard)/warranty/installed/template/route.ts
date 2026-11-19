import { auth } from "@/auth";
import { toCsv } from "@/lib/csv";
import { INSTALLED_TEMPLATE } from "@/lib/installed-base";
import { canRecordInstalledBase } from "@/lib/rbac";

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response("Unauthorized", { status: 401 });
  if (!canRecordInstalledBase(session.user.role)) return new Response("Forbidden", { status: 403 });

  return new Response("﻿" + toCsv(INSTALLED_TEMPLATE), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="adreco-installed-machines-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
