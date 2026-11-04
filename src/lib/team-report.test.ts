import { describe, expect, it } from "vitest";
import {
  buildTeamReport,
  groupForAction,
  isReportKind,
  renderReportHtml,
  renderReportText,
  reportSubject,
  reportWindow,
  summarizeGroups,
  whatsappReportParams,
  type ReportInput,
} from "@/lib/team-report";

describe("groupForAction", () => {
  it("sorts the activity log's actions into plain kinds of work", () => {
    const expected: Record<string, string> = {
      FOLLOW_UP_ADDED: "followups",
      WHATSAPP_MESSAGE_SENT: "messages",
      LEAD_EMAIL_SENT: "messages",
      LEAD_CREATED: "leads",
      LEADS_IMPORTED: "leads",
      LEAD_STATUS_CHANGED: "leads",
      LEAD_REASSIGNED: "leads",
      LEAD_CONTACT_ADDED: "leads",
      QUOTATION_CREATED: "quotes",
      QUOTATION_STATUS_CHANGED: "quotes",
      SURVEY_CREATED: "quotes",
      SALES_ORDER_CREATED: "orders",
      DISPATCH_DETAILS_UPDATED: "orders",
      SERIALS_DISPATCHED: "orders",
      SERIAL_RETURNED_TO_STOCK: "orders",
      INSTALLATION_CREATED: "projects",
      COMMISSIONING_COMPLETED: "projects",
      DEPARTMENT_STAGE_COMPLETED: "projects",
      CUSTOMER_SIGN_OFF_RECORDED: "projects",
      EQUIPMENT_LINKED: "projects",
      TICKET_RAISED: "service",
      TECHNICIAN_CHECKED_IN: "service",
      PART_USED: "service",
      WARRANTY_CLAIM_RAISED: "service",
      AMC_RENEWED: "service",
      TASK_CREATED: "tasks",
      TASK_STATUS_CHANGED: "tasks",
      DOCUMENT_UPLOADED: "other",
      PRODUCT_CREATED: "other",
      PASSWORD_CHANGED: "other",
    };
    for (const [action, group] of Object.entries(expected)) expect([action, groupForAction(action)]).toEqual([action, group]);
  });

  it("puts an email to a lead with the customer messages, not with the lead updates", () => {
    expect(groupForAction("LEAD_EMAIL_SENT")).toBe("messages");
  });
});

describe("summarizeGroups", () => {
  it("lists the biggest kinds of work first", () => {
    expect(summarizeGroups({ followups: 5, messages: 2, quotes: 1 })).toBe(
      "5 follow-ups, 2 customer messages, 1 quote or survey update",
    );
    expect(summarizeGroups({ messages: 1, followups: 4 })).toBe("4 follow-ups, 1 customer message");
  });

  it("shows only the top three and says how many more there were", () => {
    expect(summarizeGroups({ followups: 9, messages: 8, leads: 7, orders: 6, tasks: 5 })).toBe(
      "9 follow-ups, 8 customer messages, 7 lead updates, 2 more kinds of work",
    );
  });

  it("is empty when nothing was done", () => {
    expect(summarizeGroups({})).toBe("");
  });
});

describe("reportWindow", () => {
  const now = new Date("2026-11-05T02:30:00Z"); // 08:00 on 5 Nov in India

  it("makes yesterday the whole of the previous Indian day", () => {
    const w = reportWindow("yesterday", now);
    expect(w.start.toISOString()).toBe("2026-11-03T18:30:00.000Z");
    expect(w.end.toISOString()).toBe("2026-11-04T18:30:00.000Z");
  });

  it("makes today run from midnight in India until now", () => {
    const w = reportWindow("today", now);
    expect(w.start.toISOString()).toBe("2026-11-04T18:30:00.000Z");
    expect(w.end).toEqual(now);
  });

  it("makes the week seven Indian days ending now", () => {
    expect(reportWindow("week", now).start.toISOString()).toBe("2026-10-29T18:30:00.000Z");
  });

  it("recognises the three kinds", () => {
    expect(isReportKind("today")).toBe(true);
    expect(isReportKind("week")).toBe(true);
    expect(isReportKind("month")).toBe(false);
    expect(isReportKind(undefined)).toBe(false);
  });
});

function sampleInput(): ReportInput {
  const now = new Date("2026-11-05T02:30:00Z");
  return {
    window: reportWindow("yesterday", now),
    users: [
      { id: "u-ravi", name: "Ravi Nair", role: "DESIGN" },
      { id: "u-asha", name: "Asha Rao", role: "SALES" },
      { id: "u-kiran", name: "Kiran Shah", role: "ACCOUNTS" },
    ],
    activity: [
      { userId: "u-asha", action: "FOLLOW_UP_ADDED", count: 5, lastAt: new Date("2026-11-04T10:00:00Z") },
      { userId: "u-asha", action: "LEAD_EMAIL_SENT", count: 2, lastAt: new Date("2026-11-04T12:12:00Z") },
      { userId: "u-asha", action: "QUOTATION_CREATED", count: 1, lastAt: new Date("2026-11-04T08:00:00Z") },
      { userId: "u-admin", action: "TASK_CREATED", count: 3, lastAt: new Date("2026-11-04T09:00:00Z") },
    ],
    chatByUser: { "u-kiran": 4, "u-asha": 10 },
    newLeads: 3,
    overdueByOwner: { "u-asha": 3 },
    staleByOwner: { "u-asha": 1 },
    tasksOverdueByUser: { "u-ravi": 2 },
    lists: {
      overdue: [{ id: "L1", customerName: "Mr. Ramesh Sethi", ownerName: "Asha Rao", note: "due 02 Nov 2026" }],
      neverContacted: [{ id: "L2", customerName: "Pooja", ownerName: null, note: "added 03 Nov 2026" }],
      stale: [],
    },
    service: { ticketsPastSla: 1, visitsOverdue: 0, renewalsSoon: 2 },
  };
}

describe("buildTeamReport", () => {
  const report = buildTeamReport(sampleInput());

  it("lists the employees alphabetically", () => {
    expect(report.employees.map((e) => e.name)).toEqual(["Asha Rao", "Kiran Shah", "Ravi Nair"]);
  });

  it("counts what each person did and when they last did it", () => {
    const asha = report.employees[0];
    expect(asha.actions).toBe(8);
    expect(asha.byGroup).toEqual({ followups: 5, messages: 2, quotes: 1 });
    expect(asha.summary).toBe("5 follow-ups, 2 customer messages, 1 quote or survey update");
    expect(asha.lastActivityAt?.toISOString()).toBe("2026-11-04T12:12:00.000Z");
    expect(asha.overdueFollowUps).toBe(3);
    expect(asha.staleLeads).toBe(1);
  });

  it("does not call someone idle who only used the chat", () => {
    const kiran = report.employees[1];
    expect(kiran.actions).toBe(0);
    expect(kiran.chatMessages).toBe(4);
    expect(kiran.idle).toBe(false);
  });

  it("flags someone with no work and no chat as having no activity", () => {
    const ravi = report.employees[2];
    expect(ravi.idle).toBe(true);
    expect(ravi.overdueTasks).toBe(2);
    expect(report.idleNames).toEqual(["Ravi Nair"]);
    expect(report.totals.idleCount).toBe(1);
  });

  it("totals the whole team, including admins' work", () => {
    expect(report.totals).toMatchObject({
      newLeads: 3,
      followUps: 5,
      customerMessages: 2,
      quoteWork: 1,
      chatMessages: 14,
      actions: 11,
      overdueFollowUps: 3,
      overdueTasks: 2,
      staleLeads: 1,
    });
  });
});

describe("renderReportText", () => {
  const report = buildTeamReport(sampleInput());
  const text = renderReportText(report, "https://crm.example.com");

  it("says who did what and who did nothing", () => {
    expect(text).toContain("Yesterday, Wed, 4 Nov 2026 (India time)");
    expect(text).toContain("- Asha Rao (Sales): 8 actions: 5 follow-ups, 2 customer messages, 1 quote or survey update; 10 chat messages;");
    expect(text).toContain("3 overdue follow-ups");
    expect(text).toContain("- Ravi Nair (Design & Engineering): NO ACTIVITY; 2 overdue tasks");
  });

  it("lists the leads that need attention", () => {
    expect(text).toContain("FOLLOW-UPS OVERDUE");
    expect(text).toContain("- Mr. Ramesh Sethi (Asha Rao): due 02 Nov 2026");
    expect(text).toContain("LEADS NOT CONTACTED YET");
    expect(text).toContain("- Pooja: added 03 Nov 2026");
    expect(text).not.toContain("UNTOUCHED FOR A WEEK");
  });

  it("mentions service items and links to the report", () => {
    expect(text).toContain("1 service ticket past its SLA, 2 AMC renewals due within 30 days");
    expect(text).toContain("Open the team report: https://crm.example.com/admin/team");
  });

  it("leaves the link out when the address of the CRM is not known", () => {
    expect(renderReportText(report, "")).not.toContain("Open the team report");
  });
});

describe("renderReportHtml", () => {
  it("escapes names so they cannot inject markup", () => {
    const input = sampleInput();
    input.users[0].name = '<img src=x onerror="alert(1)">';
    input.lists.overdue[0].customerName = "<b>Bold</b> & Co";
    const html = renderReportHtml(buildTeamReport(input), "https://crm.example.com");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>Bold</b>");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("&lt;b&gt;Bold&lt;/b&gt; &amp; Co");
  });

  it("links leads and the report when the address is known, and not otherwise", () => {
    const withUrl = renderReportHtml(buildTeamReport(sampleInput()), "https://crm.example.com");
    expect(withUrl).toContain('href="https://crm.example.com/leads/L1"');
    expect(withUrl).toContain('href="https://crm.example.com/admin/team"');
    const without = renderReportHtml(buildTeamReport(sampleInput()), "");
    expect(without).not.toContain("href=");
  });

  it("marks people with no activity", () => {
    expect(renderReportHtml(buildTeamReport(sampleInput()), "")).toContain("No activity");
  });
});

describe("whatsappReportParams", () => {
  it("gives the seven values the template needs, as short single-line text", () => {
    const params = whatsappReportParams(buildTeamReport(sampleInput()), "https://crm.example.com");
    expect(params).toEqual(["Wed, 4 Nov 2026", "3", "5", "3", "2", "Ravi Nair", "https://crm.example.com/admin/team"]);
    for (const p of params) expect(p).not.toMatch(/[\r\n\t]/);
  });

  it("says nobody when everyone was active", () => {
    const input = sampleInput();
    input.users = input.users.filter((u) => u.id !== "u-ravi");
    expect(whatsappReportParams(buildTeamReport(input), "")[5]).toBe("nobody");
    expect(whatsappReportParams(buildTeamReport(input), "")[6]).toBe("the CRM");
  });

  it("shortens a very long list of names", () => {
    const input = sampleInput();
    input.users = Array.from({ length: 40 }, (_, i) => ({ id: `x${i}`, name: `Employee Number ${i}`, role: "SALES" as const }));
    input.activity = [];
    input.chatByUser = {};
    const names = whatsappReportParams(buildTeamReport(input), "")[5];
    expect(names.length).toBeLessThanOrEqual(160);
    expect(names.endsWith("…")).toBe(true);
  });
});

describe("reportSubject", () => {
  it("names the day", () => {
    expect(reportSubject(buildTeamReport(sampleInput()))).toBe("Adreco CRM daily update — Wed, 4 Nov 2026");
  });
});
