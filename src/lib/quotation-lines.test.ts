import { describe, expect, it } from "vitest";
import {
  addCatalogLine,
  catalogLineDescription,
  insertPastedRows,
  parsePastedRows,
  splitTrailingFigures,
  tidyRow,
  type CatalogProduct,
  type QuoteRow,
} from "@/lib/quotation-lines";

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

describe("splitTrailingFigures", () => {
  it("takes the unit, quantity, rate and amount that a spreadsheet paste left in the description", () => {
    expect(
      splitTrailingFigures(
        "Compulsory Accessories for Tank: Temperature & Pressure Gauge, ARV, Sensor Insert, Back Up Heater: 6kW or 3kW x 1 Unit with Thermostat SET 1 7000 7000",
      ),
    ).toEqual({
      description:
        "Compulsory Accessories for Tank: Temperature & Pressure Gauge, ARV, Sensor Insert, Back Up Heater: 6kW or 3kW x 1 Unit with Thermostat",
      quantity: 1,
      unitPrice: 7000,
    });
  });

  it("reads several units and rupee formatting", () => {
    expect(splitTrailingFigures("MS Stand with Anti-Vibration Pad Nos 2 ₹1,000 ₹2,000")).toEqual({
      description: "MS Stand with Anti-Vibration Pad",
      quantity: 2,
      unitPrice: 1000,
      });
  });

  it("works without a unit word", () => {
    expect(splitTrailingFigures("Brass fittings 3 500 1500")).toEqual({ description: "Brass fittings", quantity: 3, unitPrice: 500 });
  });

  it("leaves a description alone when the last numbers are not quantity x rate = amount", () => {
    expect(splitTrailingFigures("Capacity 500 liters, test pressure 5 8 12")).toBeNull();
    expect(splitTrailingFigures("EVI Heat Pump 30 kW (EVI-30)")).toBeNull();
    expect(splitTrailingFigures("Model ARC/PW/D/7")).toBeNull();
  });

  it("never leaves an empty description", () => {
    expect(splitTrailingFigures("1 7000 7000")).toBeNull();
  });
});

describe("tidyRow", () => {
  it("moves the figures into the quantity and price when the row has no price", () => {
    expect(tidyRow({ description: "Thermostat SET 1 7000 7000", quantity: "1", unitPrice: "" })).toEqual({
      description: "Thermostat",
      quantity: "1",
      unitPrice: "7000",
    });
  });

  it("only cleans the text when a price was already typed", () => {
    expect(tidyRow({ description: "Thermostat SET 1 7000 7000", quantity: "2", unitPrice: "6500" })).toEqual({
      description: "Thermostat",
      quantity: "2",
      unitPrice: "6500",
    });
  });

  it("returns an ordinary row untouched", () => {
    const row = { description: "Site survey", quantity: "1", unitPrice: "5000" };
    expect(tidyRow(row)).toBe(row);
  });
});

describe("parsePastedRows", () => {
  it("reads a spreadsheet row with tab-separated columns", () => {
    expect(parsePastedRows("Compulsory Accessories for Tank\tSET\t1\t7,000\t7,000")).toEqual([
      { description: "Compulsory Accessories for Tank", quantity: "1", unitPrice: "7000" },
    ]);
  });

  it("makes one row per spreadsheet line and ignores the serial-number column", () => {
    const text = "1\tMS Pressurised Hot Water Tank\t1\t60000\t60000\r\n2\tCPVC Plumbing material\tSET\t1\t8000\t8000\r\n";
    expect(parsePastedRows(text)).toEqual([
      { description: "MS Pressurised Hot Water Tank", quantity: "1", unitPrice: "60000" },
      { description: "CPVC Plumbing material", quantity: "1", unitPrice: "8000" },
    ]);
  });

  it("handles a line pasted with the columns collapsed into spaces", () => {
    expect(parsePastedRows("Compulsory Accessories SET 1 7000 7000")).toEqual([
      { description: "Compulsory Accessories", quantity: "1", unitPrice: "7000" },
    ]);
  });

  it("leaves ordinary text to the normal paste", () => {
    expect(parsePastedRows("EVI Heat Pump 30 kW")).toBeNull();
    expect(parsePastedRows("Line one\nLine two")).toBeNull();
    expect(parsePastedRows("")).toBeNull();
  });
});

describe("insertPastedRows", () => {
  const pasted: QuoteRow[] = [
    { description: "A", quantity: "1", unitPrice: "10" },
    { description: "B", quantity: "2", unitPrice: "20" },
  ];

  it("fills an empty row and adds the rest below it", () => {
    expect(insertPastedRows([blank], 0, pasted)).toEqual(pasted);
  });

  it("keeps a row that already has content and puts the pasted rows after it", () => {
    const typed: QuoteRow = { description: "Survey", quantity: "1", unitPrice: "5" };
    expect(insertPastedRows([typed, blank], 0, pasted)).toEqual([typed, ...pasted, blank]);
  });
});
