/**
 * Line-item rows as the quotation form holds them (everything is text until it is sent to the server), and the
 * rule for turning a pick from the product catalog into a row. Kept free of React so it can be unit-tested.
 */

export type QuoteRow = { description: string; quantity: string; unitPrice: string };

/* ---------------------------------------------------------------------------------------------------------------
 * Rows copied from a spreadsheet or a Word table
 * ------------------------------------------------------------------------------------------------------------- */

/** A number as it is written in a cell: "7000", "7,000", "1,00,000", "₹7,000.50". Null when the cell is not a plain number. */
export function parseCellNumber(cell: string): number | null {
  const text = cell.replace(/[₹\s]/g, "").replace(/^rs\.?/i, "");
  if (!/^\d[\d,]*(\.\d+)?$/.test(text)) return null;
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** Words a table uses for its "unit" column, which sit between the description and the figures. */
const UNIT_WORDS = /^(?:set|sets|no|nos|pc|pcs|unit|units|lot|lots|pair|pairs|each|ea|mtr|mtrs|m|kg|kgs|ltr|ltrs|sqft|rm)\.?$/i;

/**
 * A row pasted from a table as tab-separated cells (description, optional unit, then quantity, rate and amount, with a
 * serial number in front perhaps) becomes line items. Null when the text holds no tab, so an ordinary paste is left
 * alone. Several lines make several rows. The amount is not kept: it is worked out from the quantity and rate.
 */
export function parsePastedRows(text: string): QuoteRow[] | null {
  if (!text.includes("\t")) return null;

  const rows: QuoteRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const cells = line.split("\t").map((c) => c.trim());

    // The description is the first cell with words in it; a serial number before it is dropped.
    const at = cells.findIndex((c) => c !== "" && parseCellNumber(c) === null);
    if (at === -1) continue;
    let rest = cells.slice(at + 1).filter((c) => c !== "");
    if (rest.length > 0 && UNIT_WORDS.test(rest[0])) rest = rest.slice(1);

    const figures: number[] = [];
    for (const cell of rest) {
      const n = parseCellNumber(cell);
      if (n === null) break;
      figures.push(n);
    }

    let quantity = "1";
    let unitPrice = "";
    if (figures.length >= 3) {
      quantity = String(figures[0]);
      unitPrice = String(figures[1]);
    } else if (figures.length === 2) {
      // Quantity and rate, unless both are the same number: then it is the rate and its amount, for one.
      if (figures[0] === figures[1]) unitPrice = String(figures[0]);
      else {
        quantity = String(figures[0]);
        unitPrice = String(figures[1]);
      }
    } else if (figures.length === 1) {
      unitPrice = String(figures[0]);
    }
    rows.push({ description: cells[at], quantity, unitPrice });
  }
  return rows.length > 0 ? rows : null;
}

/**
 * Puts rows pasted into the description of row `index` into the quote: the first one fills that row (keeping its own
 * quantity and price when the paste had none), the others follow it.
 */
export function applyPastedRows(rows: QuoteRow[], index: number, pasted: QuoteRow[]): QuoteRow[] {
  const [first, ...more] = pasted;
  const target = rows[index];
  if (!target || !first) return rows;
  const merged: QuoteRow = {
    description: first.description,
    quantity: first.unitPrice === "" && first.quantity === "1" ? target.quantity : first.quantity,
    unitPrice: first.unitPrice === "" ? target.unitPrice : first.unitPrice,
  };
  return [...rows.slice(0, index), merged, ...more, ...rows.slice(index + 1)];
}

/**
 * Takes the figures off the end of a description when they are only a copy of the line's own numbers, as in
 * "…Thermostat SET 1 7000 7000" on a line of 1 at 7,000 (a pasted table row). The figures must be exactly this line's
 * quantity, rate and amount (or its rate and amount), and a unit word such as SET or NOS in front of them goes too, so
 * a description that really ends in a number is never touched.
 */
export function stripEchoedFigures(description: string, quantity: number, unitPrice: number): string {
  const text = description.trim();
  const amount = Math.round(quantity * unitPrice * 100) / 100;
  const words = [...text.matchAll(/\S+/g)].map((m) => ({ word: m[0], end: (m.index ?? 0) + m[0].length }));

  const tailMatches = (count: number, expected: number[]) => {
    if (words.length <= count) return false;
    const tail = words.slice(-count).map((w) => parseCellNumber(w.word));
    return tail.every((n, i) => n !== null && n === expected[i]);
  };

  let drop = 0;
  if (tailMatches(3, [quantity, unitPrice, amount])) drop = 3;
  else if (tailMatches(2, [unitPrice, amount])) drop = 2;
  if (drop === 0) return text;

  let keep = words.length - drop;
  if (keep > 1 && UNIT_WORDS.test(words[keep - 1].word)) keep -= 1;
  const stripped = text.slice(0, words[keep - 1].end).trim();
  // What is left must still describe something: not nothing, and not just a number.
  return stripped === "" || parseCellNumber(stripped) !== null ? text : stripped;
}

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
