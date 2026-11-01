import { describe, expect, it } from "vitest";
import { parseLeadTable } from "@/lib/lead-import";
import { leadFromImportRow } from "@/lib/lead-import-save";

// Made-up rows in the layout of a sales team's prospect sheet.
const table = [
  ["Date", "Sr.No.", "Contact No.", "Name", "Company Name/Location", "Project", "Follow-up", "Remarks", "Quote"],
  ["05/03/2026", "1", "9000000001", "Dev (Site Incharge)", "Baner, Pune", "45 Rooms Hotel", "2026-11-18", "Called twice", "33kW Heat Pump, 375000/-"],
  ["", "", "9000000002", "Mr. Bose (Plumber)", "", "", "", "", ""],
  ["", "2", "9000000003", "Amar", "Nashik", "", "", "", ""],
];

describe("leadFromImportRow", () => {
  const { rows } = parseLeadTable(table);

  it("saves a prospect with its other contacts and its first follow-up", () => {
    expect(leadFromImportRow(rows[0], "user-1", "sales-1")).toMatchObject({
      customerName: "Dev",
      contactRole: "Site in-charge",
      phone: "9000000001",
      address: "Baner, Pune",
      productCategory: "Commercial Heat Pump",
      budget: 375000,
      source: "Imported",
      status: "QUOTED",
      assignedToId: "sales-1",
      createdById: "user-1",
      createdAt: new Date("2026-03-05T00:00:00.000Z"),
      contacts: { create: [{ name: "Mr. Bose", role: "Plumber", phone: "9000000002", email: null }] },
      followUps: {
        create: [{ userId: "user-1", note: "Called twice\nQuote given: 33kW Heat Pump, 375000/-", nextFollowUpDate: new Date("2026-11-18T00:00:00.000Z") }],
      },
    });
  });

  it("leaves out the follow-up and the date a prospect does not have", () => {
    const data = leadFromImportRow(rows[1], "user-1", null);
    expect(data).toMatchObject({ customerName: "Amar", assignedToId: null, status: "NEW" });
    expect(data.followUps).toBeUndefined();
    expect(data).not.toHaveProperty("createdAt");
  });
});
