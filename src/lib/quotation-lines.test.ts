import { describe, expect, it } from "vitest";
import { addCatalogLine, catalogLineDescription, type CatalogProduct, type QuoteRow } from "@/lib/quotation-lines";

const evi: CatalogProduct = {
  id: "p1",
  name: "EVI Heat Pump 30 kW",
  modelCode: "EVI-30",
  isSparePart: false,
  customerPrice: 325000,
};

const compressor: CatalogProduct = {
  id: "p2",
  name: "Scroll Compressor 30 kW",
  modelCode: "SP-COMP-30",
  isSparePart: true,
  customerPrice: 48000.5,
};

const blank: QuoteRow = { description: "", quantity: "1", unitPrice: "" };

describe("catalogLineDescription", () => {
  it("shows the name with the model code", () => {
    expect(catalogLineDescription(evi)).toBe("EVI Heat Pump 30 kW (EVI-30)");
  });
});

describe("addCatalogLine", () => {
  it("fills the untouched starting row with the product and its customer price", () => {
    expect(addCatalogLine([blank], evi)).toEqual([
      { description: "EVI Heat Pump 30 kW (EVI-30)", quantity: "1", unitPrice: "325000" },
    ]);
  });

  it("keeps decimals in the price", () => {
    expect(addCatalogLine([blank], compressor)[0].unitPrice).toBe("48000.5");
  });

  it("appends below rows that already have content", () => {
    const typed: QuoteRow = { description: "Site survey", quantity: "1", unitPrice: "5000" };
    const rows = addCatalogLine([typed], evi);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(typed);
    expect(rows[1].description).toBe("EVI Heat Pump 30 kW (EVI-30)");
  });

  it("does not take over a last row where something has been typed, even without a price", () => {
    const halfTyped: QuoteRow = { description: "Chimney work", quantity: "1", unitPrice: "" };
    expect(addCatalogLine([halfTyped], evi)).toHaveLength(2);
  });

  it("does not take over a last row where only a price has been typed", () => {
    const priceOnly: QuoteRow = { description: "", quantity: "1", unitPrice: "1200" };
    expect(addCatalogLine([priceOnly], evi)).toHaveLength(2);
  });

  it("replaces only the last row when it is untouched", () => {
    const typed: QuoteRow = { description: "Site survey", quantity: "1", unitPrice: "5000" };
    const rows = addCatalogLine([typed, blank], evi);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(typed);
    expect(rows[1].description).toBe("EVI Heat Pump 30 kW (EVI-30)");
  });

  it("adds one more unit when the product is already on the quote, keeping its edited price", () => {
    const first = addCatalogLine([blank], evi);
    const edited = first.map((r) => ({ ...r, unitPrice: "310000" }));
    const rows = addCatalogLine(edited, evi);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe("2");
    expect(rows[0].unitPrice).toBe("310000");
  });

  it("counts from one when the existing quantity was cleared", () => {
    const rows = addCatalogLine([{ description: "EVI Heat Pump 30 kW (EVI-30)", quantity: "", unitPrice: "1" }], evi);
    expect(rows[0].quantity).toBe("1");
  });

  it("leaves the price blank when the catalog has none", () => {
    const rows = addCatalogLine([blank], { ...evi, customerPrice: null });
    expect(rows[0].unitPrice).toBe("");
  });

  it("does not change the rows it was given", () => {
    const original = [{ ...blank }];
    addCatalogLine(original, evi);
    expect(original).toEqual([blank]);
  });
});
