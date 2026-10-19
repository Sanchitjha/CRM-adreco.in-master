import { NextResponse } from "next/server";
import { endOfDay } from "date-fns";
import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mailer";

export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const todayEnd = endOfDay(new Date());
  const users = await prisma.user.findMany({ where: { active: true } });

  let sent = 0;

  for (const user of users) {
    const lines: string[] = [];

    if (user.role === "SALES") {
      const leads = await prisma.lead.findMany({
        where: { assignedToId: user.id, status: { notIn: ["CONVERTED", "LOST"] } },
        include: { followUps: { orderBy: { followUpDate: "desc" }, take: 1 } },
      });
      const due = leads.filter((lead) => {
        const next = lead.followUps[0]?.nextFollowUpDate;
        return next && next <= todayEnd;
      });
      if (due.length > 0) {
        lines.push(`Follow-ups due or overdue (${due.length}):`);
        for (const lead of due) lines.push(`- ${lead.customerName} (${lead.phone})`);
      }
    }

    if (user.role === "ADMIN") {
      const openLeads = await prisma.lead.findMany({
        where: { status: { notIn: ["CONVERTED", "LOST"] } },
        include: { followUps: { orderBy: { followUpDate: "desc" }, take: 1 } },
      });
      const teamDue = openLeads.filter((lead) => {
        const next = lead.followUps[0]?.nextFollowUpDate;
        return next && next <= todayEnd;
      });
      if (teamDue.length > 0) {
        lines.push(`Team-wide: ${teamDue.length} lead(s) have follow-ups due or overdue.`);
      }
    }

    const tasks = await prisma.task.findMany({
      where: { assignedToId: user.id, status: { not: "DONE" }, dueDate: { lte: todayEnd } },
    });
    if (tasks.length > 0) {
      lines.push(`Tasks due or overdue (${tasks.length}):`);
      for (const task of tasks) lines.push(`- ${task.title}`);
    }

    if (lines.length === 0) continue;

    try {
      await sendMail(user.email, "Adreco CRM — items due today", lines.join("\n"));
      sent += 1;
    } catch {
      // SMTP not configured or send failed for this user — don't fail the whole run.
    }
  }

  return NextResponse.json({ sent });
}
