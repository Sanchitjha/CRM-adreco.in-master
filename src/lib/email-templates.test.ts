import { describe, expect, it } from "vitest";
import { emailTemplates, type QuoteSummary } from "@/lib/email-templates";

const quote: QuoteSummary = {
  number: "QT-0012",
  dateLabel: "05 Nov 2026",
  validUntilLabel: "20 Nov 2026",
  lines: [
    { description: "Heat pump 12 kW", quantity: 2, amountLabel: "₹3,60,000" },
    { description: "Storage tank 500 L", quantity: 1, amountLabel: "₹45,000" },
  ],
  totalLabel: "₹4,78,000",
};

describe("emailTemplates", () => {
  it("offers an enquiry reply and a follow-up when there is no quotation", () => {
    const templates = emailTemplates({ customerName: "Meera Test", productCategory: null, quote: null });
    expect(templates.map((t) => t.id)).toEqual(["enquiry", "followup"]);
    expect(templates[0].body.startsWith("Dear Meera Test,")).toBe(true);
  });

  it("mentions the product when the lead has one", () => {
    const templates = emailTemplates({ customerName: "Meera Test", productCategory: "Solar Heat Pump" });
    expect(templates[0].body).toContain("about Solar Heat Pump");
  });

  it("adds a quotation email that lists the lines and the total", () => {
    const templates = emailTemplates({ customerName: "Meera Test", quote });
    const q = templates.find((t) => t.id === "quotation");
    expect(q).toBeDefined();
    expect(q!.subject).toBe("Quotation QT-0012");
    expect(q!.body).toContain("1. Heat pump 12 kW (qty 2): ₹3,60,000");
    expect(q!.body).toContain("2. Storage tank 500 L (qty 1): ₹45,000");
    expect(q!.body).toContain("valid until 20 Nov 2026");
    expect(q!.body).toContain("₹4,78,000");
  });

  it("leaves out the validity when the quotation has none", () => {
    const q = emailTemplates({ customerName: "Meera Test", quote: { ...quote, validUntilLabel: null } }).find(
      (t) => t.id === "quotation",
    )!;
    expect(q.body).not.toContain("valid until");
  });

  it("greets without a name when the lead has none", () => {
    expect(emailTemplates({ customerName: "  " })[0].body.startsWith("Hello,")).toBe(true);
  });
});
