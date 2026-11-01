import { describe, expect, it } from "vitest";
import { classifyRole, extractEmail, firstAmount, guessCategory, parseFlexibleDate, splitPeople } from "@/lib/prospect-parse";

describe("classifyRole", () => {
  it("recognises the roles people write", () => {
    expect(classifyRole("Site Incharge")).toBe("Site in-charge");
    expect(classifyRole("site in-charge")).toBe("Site in-charge");
    expect(classifyRole("Project Incharge")).toBe("Project in-charge");
    expect(classifyRole("MEP Incharge")).toBe("MEP consultant");
    expect(classifyRole("Owner")).toBe("Owner");
    expect(classifyRole("Owner's Brother")).toBe("Owner's family");
    expect(classifyRole("Plumbing Contractor")).toBe("Plumbing contractor");
    expect(classifyRole("Plumber")).toBe("Plumber");
    expect(classifyRole("Civil Contractor")).toBe("Civil contractor");
    expect(classifyRole("Complete work contractor")).toBe("Contractor");
    expect(classifyRole("PMC")).toBe("PMC");
    expect(classifyRole("Purchase")).toBe("Purchase");
    expect(classifyRole("GMO")).toBe("Manager");
    expect(classifyRole("main person")).toBe("Main contact");
  });

  it("returns null for brackets that are not roles", () => {
    expect(classifyRole("Rounak")).toBeNull();
    expect(classifyRole("")).toBeNull();
    expect(classifyRole("Sec 8")).toBeNull();
  });
});

describe("splitPeople", () => {
  it("takes a trailing role out of the name", () => {
    expect(splitPeople("Mr. Dev Kohli (Partner)")).toEqual([{ name: "Mr. Dev Kohli", role: "Partner" }]);
    expect(splitPeople("Dev (Site Incharge)")).toEqual([{ name: "Dev", role: "Site in-charge" }]);
  });

  it("leaves other brackets and plain names alone", () => {
    expect(splitPeople("Anil Kumar (Ravi)")).toEqual([{ name: "Anil Kumar (Ravi)", role: null }]);
    expect(splitPeople("  Amar  ")).toEqual([{ name: "Amar", role: null }]);
  });

  it("does not turn a bare role into an empty name", () => {
    expect(splitPeople("(Owner)")).toEqual([{ name: "(Owner)", role: null }]);
    expect(splitPeople("")).toEqual([{ name: "", role: null }]);
  });

  it("splits two people typed into one cell", () => {
    expect(splitPeople("Dev (Site Incharge) Mr. Kapoor")).toEqual([
      { name: "Dev", role: "Site in-charge" },
      { name: "Mr. Kapoor", role: null },
    ]);
    expect(splitPeople("Asha (Owner) Mr. Bose (Plumber)")).toEqual([
      { name: "Asha", role: "Owner" },
      { name: "Mr. Bose", role: "Plumber" },
    ]);
  });

  it("accepts a separator between the people", () => {
    const expected = [
      { name: "Dev", role: "Owner" },
      { name: "Mr. Kapoor", role: null },
    ];
    for (const text of ["Dev (Owner), Mr. Kapoor", "Dev (Owner) / Mr. Kapoor", "Dev (Owner) & Mr. Kapoor", "Dev (Owner) and Mr. Kapoor", "Dev (Owner) - Mr. Kapoor"]) {
      expect(splitPeople(text)).toEqual(expected);
    }
  });

  it("keeps the whole cell when what follows a role is not a name", () => {
    for (const text of ["Dev (Owner) 98765 43210", "Dev (Owner) wants a quote", "Dev (Owner) Needs a quote by month end"]) {
      expect(splitPeople(text)).toEqual([{ name: text, role: null }]);
    }
  });
});

describe("guessCategory", () => {
  it("picks pools first, then commercial, then domestic", () => {
    expect(guessCategory("10 x 15 x 4 Pool Size")).toBe("Swimming Pool Heat Pump");
    expect(guessCategory("Swmming pool for the hotel")).toBe("Swimming Pool Heat Pump");
    expect(guessCategory("45 Rooms Hotel")).toBe("Commercial Heat Pump");
    expect(guessCategory("6000 L water heating for Gas boiler, Dairy")).toBe("Commercial Heat Pump");
    expect(guessCategory("4 Bathrooms 2 Bath Tubs")).toBe("Domestic Heat Pump");
    expect(guessCategory("300 L Dom")).toBe("Domestic Heat Pump");
  });

  it("gives up when the text says nothing about the application", () => {
    expect(guessCategory("New Construction")).toBeNull();
    expect(guessCategory("")).toBeNull();
  });
});

describe("firstAmount", () => {
  it("finds the price in a quote note", () => {
    expect(firstAmount("33kW Heat Pump, 375000/-")).toBe(375000);
    expect(firstAmount("7kW 500L, 185000/-")).toBe(185000);
    expect(firstAmount("52kW x 3 Units, 1875000/-")).toBe(1875000);
    expect(firstAmount("300L, 127000/- + GST Closed")).toBe(127000);
    expect(firstAmount("33kW, 3,75,000/- + GST")).toBe(375000);
  });

  it("ignores capacities, sizes and phone numbers", () => {
    expect(firstAmount("1000 L, 10kW")).toBeNull();
    expect(firstAmount("call 9876543210")).toBeNull();
    expect(firstAmount("10,000 L tank")).toBeNull();
    expect(firstAmount("")).toBeNull();
  });
});

describe("extractEmail", () => {
  it("pulls an address out of surrounding text", () => {
    expect(extractEmail("Meera, meera.test@example.com")).toBe("meera.test@example.com");
    expect(extractEmail("no address here")).toBeNull();
  });
});

describe("parseFlexibleDate", () => {
  it("reads ISO dates and day-first Indian forms", () => {
    expect(parseFlexibleDate("2026-11-18")).toBe("2026-11-18");
    expect(parseFlexibleDate("2026-11-18T00:00:00Z")).toBe("2026-11-18");
    expect(parseFlexibleDate("18/11/2026")).toBe("2026-11-18");
    expect(parseFlexibleDate("8-1-26")).toBe("2026-01-08");
    expect(parseFlexibleDate("18.11.2026")).toBe("2026-11-18");
    expect(parseFlexibleDate("18 Nov 2026")).toBe("2026-11-18");
    expect(parseFlexibleDate("18-Nov-26")).toBe("2026-11-18");
  });

  it("rejects impossible and unrecognised dates", () => {
    expect(parseFlexibleDate("31/02/2026")).toBeNull();
    expect(parseFlexibleDate("2026-13-01")).toBeNull();
    expect(parseFlexibleDate("after 20 days")).toBeNull();
    expect(parseFlexibleDate("")).toBeNull();
  });
});
