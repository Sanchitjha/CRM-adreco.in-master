import { describe, expect, it } from "vitest";
import { formatCompanyAddress, listMissing, missingCompanyDetails } from "@/lib/company-profile";

describe("formatCompanyAddress", () => {
  it("joins the street address with the city, state and PIN code", () => {
    expect(formatCompanyAddress({ address: "Plot 12, Phase 2", city: "Mohali", state: "Punjab", pincode: "160055" })).toBe(
      "Plot 12, Phase 2, Mohali, Punjab, 160055",
    );
  });

  it("copes with parts that are missing or blank", () => {
    expect(formatCompanyAddress({ address: "", city: "Mohali", state: null, pincode: " " })).toBe("Mohali");
    expect(formatCompanyAddress(null)).toBe("");
    expect(formatCompanyAddress({})).toBe("");
  });
});

describe("missingCompanyDetails", () => {
  it("lists what Settings still needs", () => {
    expect(missingCompanyDetails(null)).toEqual(["logo", "address"]);
    expect(missingCompanyDetails({ logoUrl: "data:image/png;base64,AAAA" })).toEqual(["address"]);
    expect(missingCompanyDetails({ address: "Plot 12" })).toEqual(["logo"]);
    expect(missingCompanyDetails({ address: "Plot 12", logoUrl: "https://x.example/logo.png" })).toEqual([]);
  });

  it("does not count a lone city as an address-less profile", () => {
    expect(missingCompanyDetails({ city: "Mohali", logoUrl: "https://x.example/logo.png" })).toEqual([]);
  });

  it("words the list for a sentence", () => {
    expect(listMissing(["logo", "address"])).toBe("logo and address");
  });
});
