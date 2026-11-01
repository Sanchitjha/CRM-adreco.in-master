import { describe, expect, it } from "vitest";
import { DEMO_PRODUCTS, DEMO_PROSPECT_COUNT, demoProspectSheet } from "@/lib/demo-data";
import { parseLeadTable } from "@/lib/lead-import";
import { phoneKey } from "@/lib/lead-dedupe";
import { PRODUCT_CATEGORIES } from "@/lib/validation/lead";

const DAY_MS = 24 * 60 * 60 * 1000;
// 11:30 in India on Monday 2 November 2026.
const NOW = new Date("2026-11-02T06:00:00Z");
const TODAY = "2026-11-02";

describe("demoProspectSheet", () => {
  const sheet = demoProspectSheet(NOW);
  const parsed = parseLeadTable(sheet);

  it("reads cleanly through the importer", () => {
    expect(parsed.fatal).toBeNull();
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toHaveLength(DEMO_PROSPECT_COUNT);
    expect(parsed.totalRows).toBe(sheet.length - 1);
  });

  it("spreads the prospects over every stage and every kind of project", () => {
    const count = (values: (string | null)[]) => values.reduce<Record<string, number>>((n, v) => ({ ...n, [String(v)]: (n[String(v)] ?? 0) + 1 }), {});
    expect(count(parsed.rows.map((r) => r.status))).toEqual({ QUOTED: 14, FOLLOW_UP: 14, CONTACTED: 7, NEW: 5 });
    expect(new Set(parsed.rows.map((r) => r.productCategory))).toEqual(
      new Set(["Swimming Pool Heat Pump", "Commercial Heat Pump", "Domestic Heat Pump"]),
    );
    expect(parsed.rows.filter((r) => r.status === "QUOTED").every((r) => r.budget !== null)).toBe(true);
  });

  it("has other people on about half of the projects", () => {
    const withContacts = parsed.rows.filter((r) => r.contacts.length > 0).length;
    expect(withContacts).toBeGreaterThanOrEqual(10);
    expect(withContacts).toBeLessThanOrEqual(30);
    expect(parsed.rows.filter((r) => r.contactRole).length).toBeGreaterThan(5);
  });

  it("includes people typed two to a cell, the second without a phone of their own", () => {
    const split = parsed.rows.filter((r) => r.contactRole === "Site in-charge" && r.contacts.some((c) => c.phone === null && c.role === null));
    expect(split.length).toBeGreaterThanOrEqual(2);
  });

  it("has follow-ups overdue, due today and coming up", () => {
    const dates = parsed.rows.flatMap((r) => (r.followUp?.nextDate ? [r.followUp.nextDate] : []));
    expect(dates.filter((d) => d < TODAY).length).toBeGreaterThanOrEqual(3);
    expect(dates.filter((d) => d === TODAY).length).toBeGreaterThanOrEqual(1);
    expect(dates.filter((d) => d > TODAY).length).toBeGreaterThanOrEqual(8);
  });

  it("dates every enquiry in the past", () => {
    expect(parsed.rows.every((r) => r.enquiryDate !== null && r.enquiryDate <= TODAY)).toBe(true);
  });

  it("is the same on the same day and moves with the date", () => {
    expect(demoProspectSheet(new Date(NOW.getTime() + 60 * 1000))).toEqual(sheet);
    const later = parseLeadTable(demoProspectSheet(new Date(NOW.getTime() + 10 * DAY_MS)));
    expect(later.rows.map((r) => r.customerName)).toEqual(parsed.rows.map((r) => r.customerName));
    const earliest = (rows: typeof parsed.rows) => rows.flatMap((r) => (r.followUp?.nextDate ? [r.followUp.nextDate] : [])).sort()[0];
    const tenDaysOn = new Date(Date.parse(earliest(parsed.rows)) + 10 * DAY_MS).toISOString().slice(0, 10);
    expect(earliest(later.rows)).toBe(tenDaysOn);
  });

  it("uses unique numbers that cannot be a real mobile phone", () => {
    const phones = parsed.rows.flatMap((r) => [r.phone, ...r.contacts.flatMap((c) => (c.phone ? [c.phone] : []))]);
    expect(phones.every((p) => /^5\d{9}$/.test(p))).toBe(true);
    expect(new Set(phones.map(phoneKey)).size).toBe(phones.length);
  });

  it("names no real people's emails and no competitor brands", () => {
    const text = JSON.stringify(sheet);
    expect(text).not.toMatch(/jaguar|zoho|odoo|salesforce|hubspot|pipedrive|freshsales/i);
    const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
    expect(emails.every((e) => e.endsWith(".example.com"))).toBe(true);
  });
});

describe("DEMO_PRODUCTS", () => {
  it("has unique model codes, marked as demo, in the CRM's own categories", () => {
    expect(new Set(DEMO_PRODUCTS.map((p) => p.modelCode)).size).toBe(DEMO_PRODUCTS.length);
    expect(DEMO_PRODUCTS.every((p) => p.modelCode.startsWith("DEMO-"))).toBe(true);
    expect(DEMO_PRODUCTS.every((p) => (PRODUCT_CATEGORIES as readonly string[]).includes(p.category))).toBe(true);
    expect(DEMO_PRODUCTS.every((p) => p.customerPrice > p.dealerPrice)).toBe(true);
  });
});
