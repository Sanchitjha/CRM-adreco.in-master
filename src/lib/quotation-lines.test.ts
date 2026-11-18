import { describe, expect, it } from "vitest";
import {
  addCatalogLine,
  applyPastedRows,
  catalogLineDescription,
  parseCellNumber,
  parsePastedRows,
  stripEchoedFigures,
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

describe("parseCellNumber", () => {
  it("reads the ways a figure is written in a cell", () => {
    expect(parseCellNumber("7000")).toBe(7000);
    expect(parseCellNumber("7,000")).toBe(7000);
    expect(parseCellNumber("1,00,000")).toBe(100000);
    expect(parseCellNumber("₹ 7,000.50")).toBe(7000.5);
    expect(parseCellNumber("Rs. 500")).toBe(500);
  });

  it("returns null for anything that is not a plain number", () => {
    for (const cell of ["", "SET", "6kW", "1 Unit", "7000/-", "12-03", "-5"]) expect(parseCellNumber(cell)).toBeNull();
  });
});

describe("stripEchoedFigures", () => {
  const line = "Compulsory Accessories for Tank: Temperature & Pressure Gauge, ARV, Sensor Insert, Back Up Heater: 6kW or 3kW x 1 Unit with Thermostat";

  it("takes off the unit, quantity, rate and amount copied in from a table row", () => {
    expect(stripEchoedFigures(`${line} SET 1 7000 7000`, 1, 7000)).toBe(line);
    expect(stripEchoedFigures(`${line} NOS 2 5,000 10,000`, 2, 5000)).toBe(line);
    expect(stripEchoedFigures(`${line} 1 7000 7000`, 1, 7000)).toBe(line);
  });

  it("takes off a copied rate and amount on their own", () => {
    expect(stripEchoedFigures(`${line} 7000 7000`, 1, 7000)).toBe(line);
    expect(stripEchoedFigures(`${line} 5000 10000`, 2, 5000)).toBe(line);
  });

  it("leaves a description alone unless the figures are exactly this line's own", () => {
    expect(stripEchoedFigures(`${line} SET 1 7000 7000`, 1, 8000)).toBe(`${line} SET 1 7000 7000`);
    expect(stripEchoedFigures("EVI Heat Pump 30 kW 1 7000 7000", 2, 7000)).toBe("EVI Heat Pump 30 kW 1 7000 7000");
    expect(stripEchoedFigures("Heat pump 30 kW", 1, 30)).toBe("Heat pump 30 kW");
    expect(stripEchoedFigures("Back-up heater model ARC 7000", 1, 7000)).toBe("Back-up heater model ARC 7000");
  });

  it("never empties a description and keeps its line breaks", () => {
    expect(stripEchoedFigures("1 7000 7000", 1, 7000)).toBe("1 7000 7000");
    expect(stripEchoedFigures("Tank\n500 litres SET 1 60000 60000", 1, 60000)).toBe("Tank\n500 litres");
  });
});

describe("parsePastedRows", () => {
  it("leaves an ordinary paste alone", () => {
    expect(parsePastedRows("EVI Heat Pump 30 kW")).toBeNull();
    expect(parsePastedRows("line one\nline two")).toBeNull();
  });

  it("splits a table row into description, quantity and rate, dropping the unit and the amount", () => {
    expect(parsePastedRows("Compulsory Accessories for Tank\tSET\t1\t7000\t7000")).toEqual([
      { description: "Compulsory Accessories for Tank", quantity: "1", unitPrice: "7000" },
    ]);
    expect(parsePastedRows("Tank 500 L\t2\t60,000\t1,20,000")).toEqual([
      { description: "Tank 500 L", quantity: "2", unitPrice: "60000" },
    ]);
  });

  it("drops a serial number in front and reads several rows", () => {
    const rows = parsePastedRows("1\tHeat pump\tNos\t1\t325000\t325000\r\n2\tPlumbing material\t\t1\t8000\t8000\r\n");
    expect(rows).toEqual([
      { description: "Heat pump", quantity: "1", unitPrice: "325000" },
      { description: "Plumbing material", quantity: "1", unitPrice: "8000" },
    ]);
  });

  it("copes with fewer figures", () => {
    expect(parsePastedRows("Stand\t4\t500")).toEqual([{ description: "Stand", quantity: "4", unitPrice: "500" }]);
    expect(parsePastedRows("Stand\t1000\t1000")).toEqual([{ description: "Stand", quantity: "1", unitPrice: "1000" }]);
    expect(parsePastedRows("Stand\t1000")).toEqual([{ description: "Stand", quantity: "1", unitPrice: "1000" }]);
    expect(parsePastedRows("Stand\t")).toEqual([{ description: "Stand", quantity: "1", unitPrice: "" }]);
  });

  it("ignores lines with no words in them", () => {
    expect(parsePastedRows("1\t2\t3\n")).toBeNull();
  });
});

describe("applyPastedRows", () => {
  const rows: QuoteRow[] = [
    { description: "", quantity: "1", unitPrice: "" },
    { description: "Later row", quantity: "3", unitPrice: "50" },
  ];

  it("fills the row that was pasted into and adds the others after it", () => {
    const pasted: QuoteRow[] = [
      { description: "A", quantity: "2", unitPrice: "100" },
      { description: "B", quantity: "1", unitPrice: "200" },
    ];
    expect(applyPastedRows(rows, 0, pasted)).toEqual([
      { description: "A", quantity: "2", unitPrice: "100" },
      { description: "B", quantity: "1", unitPrice: "200" },
      { description: "Later row", quantity: "3", unitPrice: "50" },
    ]);
  });

  it("keeps the row's own quantity and price when the paste had none", () => {
    const typed: QuoteRow[] = [{ description: "x", quantity: "4", unitPrice: "900" }];
    expect(applyPastedRows(typed, 0, [{ description: "Only words", quantity: "1", unitPrice: "" }])).toEqual([
      { description: "Only words", quantity: "4", unitPrice: "900" },
    ]);
  });

  it("does not change the rows it was given", () => {
    const copy = JSON.parse(JSON.stringify(rows));
    applyPastedRows(rows, 1, [{ description: "Z", quantity: "1", unitPrice: "1" }]);
    expect(rows).toEqual(copy);
  });
});
