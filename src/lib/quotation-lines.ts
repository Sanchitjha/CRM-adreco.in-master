/**
 * Line-item rows as the quotation form holds them (everything is text until it is sent to the server), and the
 * rule for turning a pick from the product catalog into a row. Kept free of React so it can be unit-tested.
 */

export type QuoteRow = { description: string; quantity: string; unitPrice: string };

export type CatalogProduct = {
  id: string;
  name: string;
  modelCode: string;
  isSparePart: boolean;
  /** The catalog's customer price, or null when none has been set. */
  customerPrice: number | null;
};

/** The line text a catalog product produces, e.g. "EVI Heat Pump 30 kW (EVI-30)". */
export function catalogLineDescription(product: Pick<CatalogProduct, "name" | "modelCode">): string {
  return `${product.name} (${product.modelCode})`;
}

/**
 * Adds a catalog product to the quote's line items. Picking a product that is already on the quote adds one more
 * unit to its line; otherwise it takes over an untouched last row, or becomes a new line at the customer price.
 * The price is copied once and stays editable, so a later catalog change never alters a quote.
 */
export function addCatalogLine(rows: QuoteRow[], product: CatalogProduct): QuoteRow[] {
  const description = catalogLineDescription(product);

  const existing = rows.findIndex((r) => r.description.trim() === description);
  if (existing !== -1) {
    return rows.map((r, i) => (i === existing ? { ...r, quantity: String((Number(r.quantity) || 0) + 1) } : r));
  }

  const line: QuoteRow = {
    description,
    quantity: "1",
    unitPrice: product.customerPrice === null ? "" : String(product.customerPrice),
  };

  const last = rows[rows.length - 1];
  const lastIsUntouched = !!last && last.description.trim() === "" && last.unitPrice.trim() === "";
  return lastIsUntouched ? [...rows.slice(0, -1), line] : [...rows, line];
}

// ---------------------------------------------------------------------------------------------------------------
// Rows pasted from a spreadsheet or a Word table.
//
// A line copied from Excel arrives as "description <tab> unit <tab> qty <tab> rate <tab> amount". Pasted into a text box the
// tabs turn into spaces, so the unit, quantity, rate and amount end up written inside the description:
// "...Back Up Heater: 6kW or 3kW x 1 Unit with Thermostat SET 1 7000 7000". The helpers below take those figures back out
// of the description and put them in the quantity and price columns where they belong.
// ---------------------------------------------------------------------------------------------------------------

const UNIT_WORDS = ["set", "sets", "nos", "no", "pcs", "pc", "unit", "units", "lot", "ls", "lumpsum", "job", "each", "ea", "mtr", "mtrs", "kg"];
const UNIT_WORD = new RegExp(`^(?:${UNIT_WORDS.join("|")})\\.?$`, "i");

const MONEY = String.raw`(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d{1,2})?)(?:\s*/-)?`;
// "<unit> <qty> <rate> <amount>" at the very end of the text; the unit is optional.
const TRAILING_FIGURES = new RegExp(
  String.raw`^(.*?)[\s,;:–-]*(?:\b(?:${UNIT_WORDS.join("|")})\b\.?\s+)?(\d{1,5})\s+${MONEY}\s+${MONEY}\s*$`,
  "is",
);

const toNumber = (text: string) => Number(text.replace(/,/g, ""));
const cleanSpaces = (text: string) => text.replace(/[ \t]+/g, " ").trim();

/**
 * Splits "…Thermostat SET 1 7000 7000" into the description and its figures. It only does so when the last three
 * numbers really are a quantity, a rate and their product, so a description that happens to end in numbers is left
 * alone.
 */
export function splitTrailingFigures(text: string): { description: string; quantity: number; unitPrice: number } | null {
  const match = TRAILING_FIGURES.exec(text.replace(/\s+/g, " ").trim());
  if (!match) return null;

  const description = match[1].trim();
  const quantity = toNumber(match[2]);
  const unitPrice = toNumber(match[3]);
  const amount = toNumber(match[4]);
  if (!description || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice <= 0) return null;
  if (Math.abs(quantity * unitPrice - amount) > 0.5) return null;

  return { description, quantity, unitPrice };
}

/**
 * Takes spreadsheet figures out of a row's description. The quantity and price are only filled in when the row has
 * no price yet, so a price someone has typed is never overwritten.
 */
export function tidyRow(row: QuoteRow): QuoteRow {
  const split = splitTrailingFigures(row.description);
  if (!split) return row;
  const hasPrice = row.unitPrice.trim() !== "" && Number(row.unitPrice) > 0;
  return hasPrice
    ? { ...row, description: split.description }
    : { description: split.description, quantity: String(split.quantity), unitPrice: String(split.unitPrice) };
}

const looksNumeric = (cell: string) => /^(?:₹|rs\.?|inr)?\s*\d[\d,]*(?:\.\d+)?(?:\s*\/-)?$/i.test(cell.trim());

/** One tab-separated spreadsheet line as a quote row, or null when it has no description. */
function rowFromCells(cells: string[]): QuoteRow | null {
  let parts = cells.map((c) => cleanSpaces(c)).filter((c) => c !== "");
  // A leading serial number ("1", "2"…) is the sheet's row number, not part of the item.
  if (parts.length > 2 && /^\d{1,3}\.?$/.test(parts[0]) && !looksNumeric(parts[1])) parts = parts.slice(1);

  const numbers: number[] = [];
  while (parts.length > 1 && looksNumeric(parts[parts.length - 1])) {
    numbers.unshift(toNumber(parts[parts.length - 1].replace(/[^\d.,]/g, "")));
    parts = parts.slice(0, -1);
  }
  // The unit of measure column ("SET", "Nos") sits between the description and the figures.
  if (numbers.length > 0 && parts.length > 1 && UNIT_WORD.test(parts[parts.length - 1])) parts = parts.slice(0, -1);

  const description = parts.join(" ").trim();
  if (!description) return null;

  // quantity, rate, amount | quantity, rate | rate
  const [quantity, unitPrice] = numbers.length >= 3 ? numbers.slice(-3) : numbers.length === 2 ? numbers : [1, numbers[0]];
  return {
    description,
    quantity: String(Math.max(1, Math.round(quantity ?? 1))),
    unitPrice: unitPrice === undefined || !Number.isFinite(unitPrice) ? "" : String(unitPrice),
  };
}

/**
 * Turns pasted text into quote rows when it is a spreadsheet selection (tab-separated columns, one item per line) or a
 * single line that ends in unit, quantity, rate and amount. Returns null for anything else, so ordinary text is pasted
 * the usual way.
 */
export function parsePastedRows(text: string): QuoteRow[] | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return null;

  if (lines.some((l) => l.includes("\t"))) {
    const rows = lines.map((l) => rowFromCells(l.split("\t"))).filter((r): r is QuoteRow => r !== null);
    return rows.length > 0 ? rows : null;
  }

  if (lines.length === 1) {
    const split = splitTrailingFigures(lines[0]);
    if (split) {
      return [{ description: split.description, quantity: String(split.quantity), unitPrice: String(split.unitPrice) }];
    }
  }
  return null;
}

/** Puts pasted rows into the quote: the first replaces row `index` when that row is still empty, the rest follow it. */
export function insertPastedRows(rows: QuoteRow[], index: number, pasted: QuoteRow[]): QuoteRow[] {
  const target = rows[index];
  const replaceTarget = !!target && target.description.trim() === "" && target.unitPrice.trim() === "";
  return [...rows.slice(0, index), ...(replaceTarget ? [] : target ? [target] : []), ...pasted, ...rows.slice(index + 1)];
}
