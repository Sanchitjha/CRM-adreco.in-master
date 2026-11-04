import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { sendAdminDailyUpdate } from "@/lib/admin-update";
import { purgeOldSignInFailures } from "@/lib/login-throttle";
import { endOfTodayIst, formatDate, today } from "@/lib/dates";
import { RENEWAL_REMINDER_DAYS, addDaysUtc, daysBetween } from "@/lib/lifecycle";

export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayEnd = endOfTodayIst(now);
  const todayDate = today(now);
  const users = await prisma.user.findMany({ where: { active: true } });

  // AMC contracts reach a reminder window on exactly 60, 30 and 7 days before they end, so each one is
  // mentioned three times rather than every morning.
  const renewalsDue = await prisma.amcContract.findMany({
    where: {
      status: "ACTIVE",
      endDate: { in: RENEWAL_REMINDER_DAYS.map((d) => addDaysUtc(todayDate, d)) },
      renewals: { none: {} },
    },
    include: { lead: { select: { customerName: true, assignedToId: true } } },
    orderBy: { endDate: "asc" },
  });
  const breachedTickets = await prisma.serviceTicket.findMany({
    where: { status: { not: "CLOSED" }, slaDueAt: { lt: now } },
    include: { lead: { select: { customerName: true } } },
    orderBy: { slaDueAt: "asc" },
  });
  const overdueVisits = await prisma.amcVisit.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: todayDate }, amc: { status: "ACTIVE" } },
    include: { amc: { select: { contractNumber: true, lead: { select: { customerName: true } } } } },
    orderBy: { scheduledFor: "asc" },
  });

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

    // Lifecycle: renewals go to the people who sell and service contracts; SLA breaches to the service team
    // (and whoever is assigned); overdue maintenance visits to the service team.
    const seesAllService = user.role === "ADMIN" || user.role === "SERVICE";

    const myRenewals = renewalsDue.filter((c) =>
      seesAllService ? true : user.role === "SALES" ? c.lead.assignedToId === user.id : false,
    );
    if (myRenewals.length > 0) {
      lines.push(`AMC renewals coming up (${myRenewals.length}):`);
      for (const c of myRenewals) {
        lines.push(`- ${c.contractNumber} · ${c.lead.customerName} ends ${formatDate(c.endDate)} (${daysBetween(todayDate, c.endDate)} days)`);
      }
    }

    const myBreaches = breachedTickets.filter((t) => seesAllService || t.assignedToId === user.id);
    if (myBreaches.length > 0) {
      lines.push(`Service tickets past their SLA (${myBreaches.length}):`);
      for (const t of myBreaches) lines.push(`- ${t.ticketNumber} · ${t.lead.customerName} — ${t.subject}`);
    }

    if (seesAllService && overdueVisits.length > 0) {
      lines.push(`Maintenance visits due or overdue (${overdueVisits.length}):`);
      for (const v of overdueVisits) {
        lines.push(`- ${v.amc.contractNumber} · ${v.amc.lead.customerName} (${formatDate(v.scheduledFor)})`);
      }
    }

    if (lines.length === 0) continue;

    try {
      await sendMail(user.email, "Adreco CRM — items due today", lines.join("\n"));
      sent += 1;
    } catch {
      // SMTP not configured or send failed for this user — don't fail the whole run.
    }
  }

  // The administrators' daily update: what the team did yesterday, who did nothing, and what is overdue. It goes by
  // email, and by WhatsApp to the admins who have a number saved. A problem here must not stop the rest of the job.
  let adminUpdate: Awaited<ReturnType<typeof sendAdminDailyUpdate>> | { error: string };
  try {
    adminUpdate = await sendAdminDailyUpdate({ kind: "yesterday", now });
  } catch (error) {
    adminUpdate = { error: error instanceof Error ? error.message.slice(0, 200) : "The daily update failed." };
  }

  const purged = await purgeOldSignInFailures(now);

  return NextResponse.json({ sent, purgedSignInFailures: purged, adminUpdate });
}
