/**
 * Working out what a set of installed-machine rows will do to the CRM, before anything is saved: which customer each
 * row belongs to (an existing one or a new one), which catalogue model it is, which machines would be added, and
 * which rows are repeats of what is already on record. The same plan drives the "Check file" report and the saving,
 * so what the check promises is what the import does. No database imports: the caller loads what the CRM already
 * holds (`PlanKnown`) and saves the plan (see installed-save.ts).
 */
import { addMonthsUtc } from "@/lib/lifecycle";
import { DEFAULT_WARRANTY_MONTHS } from "@/lib/lifecycle";
import type { InstalledAmc, InstalledProblem, InstalledRow } from "@/lib/installed-base";

export type KnownCustomer = { id: string; name: string; phone: string; address: string | null };

export type KnownProduct = {
  id: string;
  name: string;
  modelCode: string;
  capacityKw: number | null;
  active: boolean;
  isSparePart: boolean;
  warrantyMonths: number;
};

export type PlanKnown = {
  customers: KnownCustomer[];
  products: KnownProduct[];
  /** Serial numbers already in the CRM, lower-cased. */
  serials: Set<string>;
  /** Machines already on record, counted by `machineKey(leadId, productId, installedOn)`. */
  machineCounts: Map<string, number>;
};

export const machineKey = (customerId: string, productId: string, installedOn: string) => `${customerId}|${productId}|${installedOn}`;

export type NewCustomer = { key: string; name: string; phone: string; email: string | null; address: string | null; contactPerson: string | null };
export type NewProduct = { key: string; name: string; modelCode: string; capacityKw: number | null; warrantyMonths: number };

export type PlanItem = {
  line: number;
  row: InstalledRow;
  customer: { kind: "existing"; id: string; name: string; fillAddress: string | null } | { kind: "new"; key: string };
  product: { kind: "existing"; id: string; name: string } | { kind: "new"; key: string };
  /** Serial numbers given in the file, to be recorded. */
  serials: string[];
  /** Machines that have no serial number: the CRM gives each one a reference number when it is saved. */
  generate: number;
  warrantyStartsOn: string;
  warrantyEndsOn: string;
  amc: InstalledAmc | null;
};

export type InstalledPlan = {
  items: PlanItem[];
  newCustomers: Map<string, NewCustomer>;
  newProducts: Map<string, NewProduct>;
  /** Rows left out because the CRM already has them. */
  skipped: InstalledProblem[];
  /** Rows that cannot be placed, for example two customers with the same name and nothing to tell them apart. */
  problems: InstalledProblem[];
  totals: { machines: number; customersNew: number; customersMatched: number; amcContracts: number; newModels: number };
};

/* ---------------------------------------------------------------------------------------------------------------
 * Matching a customer
 * ------------------------------------------------------------------------------------------------------------- */

/** Lower-case letters and digits (any script) separated by single spaces, so "M/s Hotel  Ginger" and "hotel ginger" compare equal. */
export function normaliseName(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bm\/s\b/g, " ")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const alnum = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "");

/** The part of a phone number that identifies the subscriber: its last ten digits. */
export function phoneKeyOf(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

/** Whether two site descriptions are the same place, clearly different places, or cannot be compared. */
export function sameSite(a: string | null, b: string | null): "same" | "different" | "unknown" {
  const x = a ? normaliseName(a) : "";
  const y = b ? normaliseName(b) : "";
  if (!x || !y) return "unknown";
  if (x === y || x.includes(y) || y.includes(x)) return "same";
  const pinA = x.match(/\b\d{6}\b/)?.[0];
  const pinB = y.match(/\b\d{6}\b/)?.[0];
  if (pinA && pinA === pinB) return "same";
  return "different";
}

type PoolCustomer = KnownCustomer & { planned?: string };

export type CustomerMatch =
  | { kind: "match"; customer: PoolCustomer }
  | { kind: "none" }
  | { kind: "ambiguous"; names: string[] };

/**
 * Finds the customer a row belongs to. The names must be the same. Customers with the same name at clearly different
 * places (the hotels of one group) are different customers. When the name is shared and nothing says which one, the row is
 * ambiguous rather than guessed.
 */
export function matchCustomer(row: Pick<InstalledRow, "customerName" | "phone" | "address">, pool: PoolCustomer[]): CustomerMatch {
  const name = normaliseName(row.customerName);
  const sameName = pool.filter((c) => normaliseName(c.name) === name);
  if (sameName.length === 0) return { kind: "none" };

  const key = phoneKeyOf(row.phone);
  if (key.length >= 7) {
    const byPhone = sameName.find((c) => phoneKeyOf(c.phone) === key);
    if (byPhone) return { kind: "match", customer: byPhone };
  }

  const sites = sameName.map((customer) => ({ customer, site: sameSite(row.address, customer.address) }));
  const compatible = sites.filter((s) => s.site !== "different");
  if (compatible.length === 0) return { kind: "none" };
  const exact = compatible.find((s) => s.site === "same");
  if (exact) return { kind: "match", customer: exact.customer };
  if (compatible.length === 1) return { kind: "match", customer: compatible[0].customer };
  return { kind: "ambiguous", names: compatible.map((s) => s.customer.name) };
}

/* ---------------------------------------------------------------------------------------------------------------
 * Matching a model
 * ------------------------------------------------------------------------------------------------------------- */

const trimNumber = (n: number) => String(Number(n.toFixed(2)));

function legacyCode(name: string, taken: Set<string>): string {
  const slug =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "MODEL";
  let code = `LEGACY-${slug}`;
  for (let n = 2; taken.has(code.toLowerCase()); n += 1) code = `LEGACY-${slug}-${n}`;
  return code;
}

/**
 * The catalogue model a row means. The model text matches a catalogue name or code; with no text, a capacity matches
 * a model only when exactly one active machine has that capacity. Otherwise a catalogue entry is planned for the
 * model as written ("Existing installation", hidden from new quotations), so the machine still shows its model.
 */
export function resolveProduct(
  row: Pick<InstalledRow, "model" | "capacityKw" | "warrantyMonths">,
  pool: KnownProduct[],
  created: Map<string, NewProduct>,
): { kind: "existing"; id: string; name: string } | { kind: "new"; key: string } {
  if (row.model) {
    const wanted = alnum(row.model);
    const found = pool
      .filter((p) => alnum(p.modelCode) === wanted || alnum(p.name) === wanted)
      .sort((a, b) => Number(b.active && !b.isSparePart) - Number(a.active && !a.isSparePart));
    if (found.length > 0) return { kind: "existing", id: found[0].id, name: found[0].name };
  } else if (row.capacityKw !== null) {
    const byCapacity = pool.filter((p) => p.active && !p.isSparePart && p.capacityKw === row.capacityKw);
    if (byCapacity.length === 1) return { kind: "existing", id: byCapacity[0].id, name: byCapacity[0].name };
  }

  const name = row.model ?? (row.capacityKw !== null ? `Heat pump ${trimNumber(row.capacityKw)} kW` : "Heat pump (model not recorded)");
  const key = `legacy:${alnum(name)}`;
  if (!created.has(key)) {
    const taken = new Set([...pool.map((p) => p.modelCode.toLowerCase()), ...[...created.values()].map((p) => p.modelCode.toLowerCase())]);
    created.set(key, {
      key,
      name,
      modelCode: legacyCode(name, taken),
      capacityKw: row.capacityKw,
      warrantyMonths: row.warrantyMonths && row.warrantyMonths > 0 ? row.warrantyMonths : DEFAULT_WARRANTY_MONTHS,
    });
  }
  return { kind: "new", key };
}

/* ---------------------------------------------------------------------------------------------------------------
 * The plan
 * ------------------------------------------------------------------------------------------------------------- */

const addMonthsIso = (iso: string, months: number): string => addMonthsUtc(new Date(`${iso}T00:00:00.000Z`), months).toISOString().slice(0, 10);

/** Where the warranty starts and ends. An exact end date wins over a period; with neither, the model's usual period is used. */
export function warrantyDates(
  row: Pick<InstalledRow, "installedOn" | "warrantyMonths" | "warrantyEndsOn">,
  productMonths: number,
): { startsOn: string; endsOn: string } {
  const startsOn = row.installedOn;
  if (row.warrantyEndsOn) return { startsOn, endsOn: row.warrantyEndsOn };
  if (row.warrantyMonths === 0) return { startsOn, endsOn: startsOn };
  return { startsOn, endsOn: addMonthsIso(startsOn, row.warrantyMonths ?? (productMonths > 0 ? productMonths : DEFAULT_WARRANTY_MONTHS)) };
}

export function buildPlan(rows: InstalledRow[], known: PlanKnown): InstalledPlan {
  const pool: PoolCustomer[] = known.customers.map((c) => ({ ...c }));
  const newCustomers = new Map<string, NewCustomer>();
  const newProducts = new Map<string, NewProduct>();
  const usedSerials = new Set(known.serials);
  const counts = new Map(known.machineCounts);
  const items: PlanItem[] = [];
  const skipped: InstalledProblem[] = [];
  const problems: InstalledProblem[] = [];
  const matchedIds = new Set<string>();

  for (const row of rows) {
    const match = matchCustomer(row, pool);
    if (match.kind === "ambiguous") {
      problems.push({
        sheet: row.sheet,
        line: row.line,
        message: `${row.customerName}: the CRM has several customers with this name (${match.names.length}). Add the city or the phone number to say which one.`,
      });
      continue;
    }

    let customerId: string;
    let customer: PlanItem["customer"];
    if (match.kind === "match") {
      const c = match.customer;
      customerId = c.id;
      // A customer that was added without an address takes the address of the first row that has one, so the next
      // row for a different place is recognised as a different customer.
      const fillAddress = !c.address && row.address ? row.address : null;
      if (fillAddress) {
        c.address = fillAddress;
        const planned = c.planned ? newCustomers.get(c.planned) : undefined;
        if (planned) planned.address = fillAddress;
      }
      customer = c.planned
        ? { kind: "new", key: c.planned }
        : { kind: "existing", id: c.id, name: c.name, fillAddress };
    } else {
      const key = `${normaliseName(row.customerName)}|${normaliseName(row.address ?? "") || phoneKeyOf(row.phone)}`;
      let finalKey = key;
      for (let n = 2; newCustomers.has(finalKey); n += 1) finalKey = `${key}#${n}`;
      newCustomers.set(finalKey, {
        key: finalKey,
        name: row.customerName,
        phone: row.phone,
        email: row.email,
        address: row.address,
        contactPerson: row.contactPerson,
      });
      pool.push({ id: `new:${finalKey}`, name: row.customerName, phone: row.phone, address: row.address, planned: finalKey });
      customerId = `new:${finalKey}`;
      customer = { kind: "new", key: finalKey };
    }

    const product = resolveProduct(row, known.products, newProducts);
    const productId = product.kind === "existing" ? product.id : `new:${product.key}`;
    const productMonths =
      product.kind === "existing"
        ? (known.products.find((p) => p.id === product.id)?.warrantyMonths ?? DEFAULT_WARRANTY_MONTHS)
        : (newProducts.get(product.key)?.warrantyMonths ?? DEFAULT_WARRANTY_MONTHS);

    const key = machineKey(customerId, productId, row.installedOn);
    let serials: string[] = [];
    let generate = 0;
    if (row.serials.length > 0) {
      const clashes = row.serials.filter((s) => usedSerials.has(s.toLowerCase()));
      if (clashes.length > 0) {
        const shown = clashes.slice(0, 3).join(", ");
        skipped.push({ sheet: row.sheet, line: row.line, message: `${row.customerName}: serial number ${shown}${clashes.length > 3 ? ` and ${clashes.length - 3} more` : ""} is already in the CRM.` });
        continue;
      }
      serials = row.serials;
      for (const s of serials) usedSerials.add(s.toLowerCase());
      counts.set(key, (counts.get(key) ?? 0) + serials.length);
    } else {
      generate = row.quantity - (counts.get(key) ?? 0);
      if (generate <= 0) {
        skipped.push({ sheet: row.sheet, line: row.line, message: `${row.customerName}: ${row.quantity} machine${row.quantity === 1 ? " is" : "s are"} already on record for this model and date.` });
        continue;
      }
      counts.set(key, (counts.get(key) ?? 0) + generate);
    }

    const { startsOn, endsOn } = warrantyDates(row, productMonths);
    items.push({ line: row.line, row, customer, product, serials, generate, warrantyStartsOn: startsOn, warrantyEndsOn: endsOn, amc: row.amc });
    if (match.kind === "match" && !match.customer.planned) matchedIds.add(match.customer.id);
  }

  // A new customer or model that only appears in rows that were left out is not created.
  const usedCustomers = new Set(items.flatMap((i) => (i.customer.kind === "new" ? [i.customer.key] : [])));
  const usedProducts = new Set(items.flatMap((i) => (i.product.kind === "new" ? [i.product.key] : [])));
  for (const key of [...newCustomers.keys()]) if (!usedCustomers.has(key)) newCustomers.delete(key);
  for (const key of [...newProducts.keys()]) if (!usedProducts.has(key)) newProducts.delete(key);

  return {
    items,
    newCustomers,
    newProducts,
    skipped,
    problems,
    totals: {
      machines: items.reduce((n, i) => n + i.serials.length + i.generate, 0),
      customersNew: newCustomers.size,
      customersMatched: matchedIds.size,
      amcContracts: items.filter((i) => i.amc).length,
      newModels: newProducts.size,
    },
  };
}
