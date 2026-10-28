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
