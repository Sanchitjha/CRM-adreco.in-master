import { describe, expect, it } from "vitest";
import { classifyRole, extractEmail, firstAmount, guessCategory, parseFlexibleDate, splitNameAndRole } from "@/lib/prospect-parse";

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

describe("splitNameAndRole", () => {
  it("takes a trailing role out of the name", () => {
    expect(splitNameAndRole("Mr. Rajat Mittal (Partner)")).toEqual({ name: "Mr. Rajat Mittal", role: "Partner" });
    expect(splitNameAndRole("Narayan (Site Incharge)")).toEqual({ name: "Narayan", role: "Site in-charge" });
  });

  it("leaves other brackets and plain names alone", () => {
    expect(splitNameAndRole("Abhinav Gupta (Rounak)")).toEqual({ name: "Abhinav Gupta (Rounak)", role: null });
    expect(splitNameAndRole("  Amar  ")).toEqual({ name: "Amar", role: null });
  });

  it("does not turn a bare role into an empty name", () => {
    expect(splitNameAndRole("(Owner)")).toEqual({ name: "(Owner)", role: null });
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
    expect(extractEmail("Vilas, prd.anish@gmail.com")).toBe("prd.anish@gmail.com");
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
