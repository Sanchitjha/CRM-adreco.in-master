import type { Role } from "@prisma/client";
import { escapeHtml } from "@/lib/email-compose";
import { formatLongDate, formatTime, startOfDayIstAgo } from "@/lib/dates";
import { ROLE_LABELS } from "@/lib/rbac";

/**
 * The daily update for the admin: what each person did (from the activity log), who did nothing, and what is
 * overdue. This file only builds and writes the report; the database queries are in team-report-data.ts.
 */

export type ActivityGroup = "leads" | "followups" | "messages" | "quotes" | "orders" | "projects" | "service" | "tasks" | "other";

/** In the order they are listed when counts are equal. */
const GROUP_ORDER: ActivityGroup[] = ["followups", "messages", "leads", "quotes", "orders", "projects", "service", "tasks", "other"];

const GROUP_NOUNS: Record<ActivityGroup, [string, string]> = {
  leads: ["lead update", "lead updates"],
  followups: ["follow-up", "follow-ups"],
  messages: ["customer message", "customer messages"],
  quotes: ["quote or survey update", "quote or survey updates"],
  orders: ["order update", "order updates"],
  projects: ["project update", "project updates"],
  service: ["service update", "service updates"],
  tasks: ["task update", "task updates"],
  other: ["other action", "other actions"],
};

const GROUP_RULES: [RegExp, ActivityGroup][] = [
  [/^FOLLOW_UP_/, "followups"],
  [/^(WHATSAPP_MESSAGE_SENT|LEAD_EMAIL_SENT)$/, "messages"],
  [/^LEAD/, "leads"],
  [/^(QUOTATION|SURVEY)_/, "quotes"],
  [/^(SALES_ORDER|DISPATCH|SERIALS?_DISPATCHED|SERIAL_RETURNED)/, "orders"],
  [/^(INSTALLATION|COMMISSIONING|DEPARTMENT_STAGE|CUSTOMER_SIGN_OFF|EQUIPMENT_LINKED)/, "projects"],
  [/^(TICKET|TECHNICIAN|PART_|WARRANTY|AMC)/, "service"],
  [/^TASK_/, "tasks"],
];

/** Which kind of work an activity-log action belongs to. */
export function groupForAction(action: string): ActivityGroup {
  for (const [pattern, group] of GROUP_RULES) if (pattern.test(action)) return group;
  return "other";
}

function count(n: number, [one, many]: [string, string]): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "5 follow-ups, 2 customer messages, 1 quote or survey update" — the biggest kinds of work first. */
export function summarizeGroups(byGroup: Partial<Record<ActivityGroup, number>>, show = 3): string {
  const present = GROUP_ORDER.filter((g) => (byGroup[g] ?? 0) > 0).sort(
    (a, b) => (byGroup[b] ?? 0) - (byGroup[a] ?? 0) || GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b),
  );
  const parts = present.slice(0, show).map((g) => count(byGroup[g] ?? 0, GROUP_NOUNS[g]));
  if (present.length > show) parts.push(`${present.length - show} more kinds of work`);
  return parts.join(", ");
}

/* -------------------------------------------------------------------------------- building */

export type ReportWindow = { kind: "today" | "yesterday" | "week"; start: Date; end: Date; label: string };
export type ReportKind = ReportWindow["kind"];

export function isReportKind(value: string | undefined): value is ReportKind {
  return value === "today" || value === "yesterday" || value === "week";
}

/** The stretch of time a report covers, in Indian calendar days. "Yesterday" is the whole of the day before. */
export function reportWindow(kind: ReportKind, now: Date): ReportWindow {
  if (kind === "yesterday") {
    return { kind, start: startOfDayIstAgo(1, now), end: startOfDayIstAgo(0, now), label: "Yesterday" };
  }
  if (kind === "week") return { kind, start: startOfDayIstAgo(6, now), end: now, label: "Last 7 days" };
  return { kind: "today", start: startOfDayIstAgo(0, now), end: now, label: "Today so far" };
}

export type LeadListItem = { id: string; customerName: string; ownerName: string | null; note: string };

export type ReportInput = {
  window: ReportWindow;
  /** The employees to report on one by one (active, not admins). */
  users: { id: string; name: string; role: Role }[];
  /** Activity-log rows for the window, one per person and action, for everyone including admins. */
  activity: { userId: string; action: string; count: number; lastAt: Date | null }[];
  chatByUser: Record<string, number>;
  newLeads: number;
  overdueByOwner: Record<string, number>;
  staleByOwner: Record<string, number>;
  tasksOverdueByUser: Record<string, number>;
  lists: { overdue: LeadListItem[]; neverContacted: LeadListItem[]; stale: LeadListItem[] };
  service: { ticketsPastSla: number; visitsOverdue: number; renewalsSoon: number };
};

export type EmployeeRow = {
  userId: string;
  name: string;
  role: Role;
  roleLabel: string;
  actions: number;
  chatMessages: number;
  byGroup: Partial<Record<ActivityGroup, number>>;
  summary: string;
  lastActivityAt: Date | null;
  overdueFollowUps: number;
  overdueTasks: number;
  staleLeads: number;
  /** Did nothing at all in the window: no recorded work and no chat messages. */
  idle: boolean;
};

export type TeamReport = {
  window: ReportWindow;
  totals: {
    newLeads: number;
    followUps: number;
    customerMessages: number;
    quoteWork: number;
    chatMessages: number;
    actions: number;
    overdueFollowUps: number;
    overdueTasks: number;
    staleLeads: number;
    idleCount: number;
  };
  employees: EmployeeRow[];
  idleNames: string[];
  lists: ReportInput["lists"];
  service: ReportInput["service"];
};

export function buildTeamReport(input: ReportInput): TeamReport {
  const groupTotals: Partial<Record<ActivityGroup, number>> = {};
  let actions = 0;
  const perUser = new Map<string, { byGroup: Partial<Record<ActivityGroup, number>>; total: number; lastAt: Date | null }>();

  for (const row of input.activity) {
    const group = groupForAction(row.action);
    groupTotals[group] = (groupTotals[group] ?? 0) + row.count;
    actions += row.count;
    const entry = perUser.get(row.userId) ?? { byGroup: {}, total: 0, lastAt: null };
    entry.byGroup[group] = (entry.byGroup[group] ?? 0) + row.count;
    entry.total += row.count;
    if (row.lastAt && (!entry.lastAt || row.lastAt > entry.lastAt)) entry.lastAt = row.lastAt;
    perUser.set(row.userId, entry);
  }

  const employees = input.users
    .map((user): EmployeeRow => {
      const entry = perUser.get(user.id);
      const chatMessages = input.chatByUser[user.id] ?? 0;
      const total = entry?.total ?? 0;
      return {
        userId: user.id,
        name: user.name,
        role: user.role,
        roleLabel: ROLE_LABELS[user.role],
        actions: total,
        chatMessages,
        byGroup: entry?.byGroup ?? {},
        summary: entry ? summarizeGroups(entry.byGroup) : "",
        lastActivityAt: entry?.lastAt ?? null,
        overdueFollowUps: input.overdueByOwner[user.id] ?? 0,
        overdueTasks: input.tasksOverdueByUser[user.id] ?? 0,
        staleLeads: input.staleByOwner[user.id] ?? 0,
        idle: total === 0 && chatMessages === 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const sum = (record: Record<string, number>) => Object.values(record).reduce((n, v) => n + v, 0);
  const idleNames = employees.filter((e) => e.idle).map((e) => e.name);

  return {
    window: input.window,
    totals: {
      newLeads: input.newLeads,
      followUps: groupTotals.followups ?? 0,
      customerMessages: groupTotals.messages ?? 0,
      quoteWork: groupTotals.quotes ?? 0,
      chatMessages: sum(input.chatByUser),
      actions,
      overdueFollowUps: sum(input.overdueByOwner),
      overdueTasks: sum(input.tasksOverdueByUser),
      staleLeads: sum(input.staleByOwner),
      idleCount: idleNames.length,
    },
    employees,
    idleNames,
    lists: input.lists,
    service: input.service,
  };
}

/* -------------------------------------------------------------------------------- writing */

function windowHeading(report: TeamReport): string {
  const { kind, start, label } = report.window;
  return kind === "week" ? label : `${label}, ${formatLongDate(start)}`;
}

function serviceLine(service: ReportInput["service"]): string | null {
  const parts: string[] = [];
  if (service.ticketsPastSla > 0) parts.push(count(service.ticketsPastSla, ["service ticket past its SLA", "service tickets past their SLA"]));
  if (service.visitsOverdue > 0) parts.push(count(service.visitsOverdue, ["maintenance visit overdue", "maintenance visits overdue"]));
  if (service.renewalsSoon > 0) parts.push(count(service.renewalsSoon, ["AMC renewal due within 30 days", "AMC renewals due within 30 days"]));
  return parts.length ? parts.join(", ") : null;
}

export function reportSubject(report: TeamReport): string {
  const when = report.window.kind === "week" ? "last 7 days" : formatLongDate(report.window.start);
  return `Adreco CRM daily update — ${when}`;
}

export function renderReportText(report: TeamReport, baseUrl: string): string {
  const t = report.totals;
  const lines: string[] = [`Adreco CRM daily update`, `${windowHeading(report)} (India time)`, ""];

  lines.push("THE TEAM");
  lines.push(
    `New leads ${t.newLeads} · Follow-ups logged ${t.followUps} · Messages and emails to customers ${t.customerMessages} · Quote and survey updates ${t.quoteWork} · Team chat messages ${t.chatMessages}`,
  );
  lines.push(`Overdue follow-ups ${t.overdueFollowUps} · Overdue tasks ${t.overdueTasks} · Leads untouched for a week ${t.staleLeads} · People with no activity ${t.idleCount}`);
  lines.push("");

  lines.push("WHAT EACH PERSON DID");
  if (report.employees.length === 0) lines.push("There are no employee accounts yet.");
  for (const e of report.employees) {
    const bits: string[] = [];
    if (e.idle) bits.push("NO ACTIVITY");
    else {
      if (e.actions > 0) bits.push(`${count(e.actions, ["action", "actions"])}: ${e.summary}`);
      if (e.chatMessages > 0) bits.push(count(e.chatMessages, ["chat message", "chat messages"]));
      if (e.lastActivityAt) bits.push(`last activity ${formatTime(e.lastActivityAt)}`);
    }
    if (e.overdueFollowUps > 0) bits.push(`${e.overdueFollowUps} overdue follow-up${e.overdueFollowUps === 1 ? "" : "s"}`);
    if (e.overdueTasks > 0) bits.push(`${e.overdueTasks} overdue task${e.overdueTasks === 1 ? "" : "s"}`);
    lines.push(`- ${e.name} (${e.roleLabel}): ${bits.join("; ")}`);
  }
  lines.push("");

  const sections: [string, typeof report.lists.overdue][] = [
    ["FOLLOW-UPS OVERDUE", report.lists.overdue],
    ["LEADS NOT CONTACTED YET", report.lists.neverContacted],
    ["LEADS UNTOUCHED FOR A WEEK", report.lists.stale],
  ];
  for (const [title, items] of sections) {
    if (items.length === 0) continue;
    lines.push(title);
    for (const item of items) lines.push(`- ${item.customerName}${item.ownerName ? ` (${item.ownerName})` : ""}: ${item.note}`);
    lines.push("");
  }

  const service = serviceLine(report.service);
  if (service) lines.push("SERVICE", `- ${service}`, "");

  if (baseUrl) lines.push(`Open the team report: ${baseUrl}/admin/team`);
  return lines.join("\n").trimEnd();
}

const CELL = "padding:8px 10px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-size:13px;";

export function renderReportHtml(report: TeamReport, baseUrl: string): string {
  const t = report.totals;
  const esc = escapeHtml;
  const link = (path: string, text: string) => (baseUrl ? `<a href="${esc(baseUrl)}${path}" style="color:#0f766e">${esc(text)}</a>` : esc(text));

  const stat = (label: string, value: number, danger = false) =>
    `<td style="padding:10px 14px;border:1px solid #e5e7eb;text-align:center;font-family:Arial,sans-serif"><div style="font-size:22px;font-weight:700;color:${
      danger && value > 0 ? "#be123c" : "#111827"
    }">${value}</div><div style="font-size:11px;color:#6b7280">${esc(label)}</div></td>`;

  const rows = report.employees
    .map((e) => {
      const did = e.idle
        ? `<span style="color:#be123c;font-weight:600">No activity</span>`
        : `${esc(e.summary || "—")}${e.chatMessages > 0 ? `<br><span style="color:#6b7280">${count(e.chatMessages, ["chat message", "chat messages"])}</span>` : ""}`;
      return `<tr><td style="${CELL}"><strong>${esc(e.name)}</strong><br><span style="color:#6b7280">${esc(e.roleLabel)}</span></td><td style="${CELL}">${did}</td><td style="${CELL}">${
        e.lastActivityAt ? esc(formatTime(e.lastActivityAt)) : "—"
      }</td><td style="${CELL}text-align:center;color:${e.overdueFollowUps > 0 ? "#be123c" : "#111827"}">${e.overdueFollowUps}</td><td style="${CELL}text-align:center;color:${
        e.overdueTasks > 0 ? "#be123c" : "#111827"
      }">${e.overdueTasks}</td></tr>`;
    })
    .join("");

  const list = (title: string, items: typeof report.lists.overdue) =>
    items.length === 0
      ? ""
      : `<h3 style="margin:22px 0 6px;font-size:14px;color:#111827">${esc(title)}</h3><ul style="margin:0;padding-left:18px;font-size:13px;color:#374151">${items
          .map((i) => `<li style="margin:3px 0">${link(`/leads/${i.id}`, i.customerName)}${i.ownerName ? ` (${esc(i.ownerName)})` : ""}: ${esc(i.note)}</li>`)
          .join("")}</ul>`;

  const service = serviceLine(report.service);

  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;color:#1f2937">
<h2 style="margin:0 0 2px;font-size:18px">Adreco CRM daily update</h2>
<p style="margin:0 0 16px;font-size:13px;color:#6b7280">${esc(windowHeading(report))} · India time</p>
<table style="border-collapse:collapse;margin-bottom:6px"><tr>${stat("New leads", t.newLeads)}${stat("Follow-ups logged", t.followUps)}${stat("Customer messages", t.customerMessages)}${stat("Team chat messages", t.chatMessages)}</tr></table>
<table style="border-collapse:collapse;margin-bottom:18px"><tr>${stat("Overdue follow-ups", t.overdueFollowUps, true)}${stat("Overdue tasks", t.overdueTasks, true)}${stat("Untouched for a week", t.staleLeads, true)}${stat("No activity", t.idleCount, true)}</tr></table>
<h3 style="margin:0 0 6px;font-size:14px">What each person did</h3>
<table style="border-collapse:collapse;width:100%"><tr style="background:#f9fafb;text-align:left"><th style="${CELL}">Person</th><th style="${CELL}">Did</th><th style="${CELL}">Last activity</th><th style="${CELL}text-align:center">Overdue follow-ups</th><th style="${CELL}text-align:center">Overdue tasks</th></tr>${
    rows || `<tr><td colspan="5" style="${CELL}color:#6b7280">There are no employee accounts yet.</td></tr>`
  }</table>
${list("Follow-ups overdue", report.lists.overdue)}${list("Leads not contacted yet", report.lists.neverContacted)}${list("Leads untouched for a week", report.lists.stale)}${
    service ? `<h3 style="margin:22px 0 6px;font-size:14px">Service</h3><p style="margin:0;font-size:13px;color:#374151">${esc(service)}</p>` : ""
  }
${baseUrl ? `<p style="margin:22px 0 0;font-size:13px">${link("/admin/team", "Open the team report")}</p>` : ""}
</div>`;
}

/* ------------------------------------------------------------------------------ WhatsApp */

/**
 * The seven values for the approved WhatsApp template (see DEPLOYMENT.md): the date, new leads, follow-ups logged,
 * overdue follow-ups, overdue tasks, who had no activity, and the link. All text, short, on one line each.
 */
export function whatsappReportParams(report: TeamReport, baseUrl: string): string[] {
  const names = report.idleNames.length === 0 ? "nobody" : report.idleNames.join(", ");
  return [
    report.window.kind === "week" ? "the last 7 days" : formatLongDate(report.window.start),
    String(report.totals.newLeads),
    String(report.totals.followUps),
    String(report.totals.overdueFollowUps),
    String(report.totals.overdueTasks),
    names.length > 160 ? `${names.slice(0, 157)}…` : names,
    baseUrl ? `${baseUrl}/admin/team` : "the CRM",
  ];
}
