import { describe, expect, it } from "vitest";
import type { InstalledRow } from "@/lib/installed-base";
import {
  buildPlan,
  machineKey,
  matchCustomer,
  normaliseName,
  resolveProduct,
  sameSite,
  warrantyDates,
  type KnownCustomer,
  type KnownProduct,
  type NewProduct,
  type PlanKnown,
} from "@/lib/installed-plan";

const row = (over: Partial<InstalledRow> = {}): InstalledRow => ({
  line: 2,
  customerName: "Ginger Pune",
  phone: "",
  email: null,
  address: null,
  contactPerson: null,
  model: null,
  capacityKw: null,
  quantity: 1,
  serials: [],
  installedOn: "2023-03-15",
  warrantyMonths: null,
  warrantyEndsOn: null,
  amc: null,
  notes: null,
  ...over,
});

const product = (over: Partial<KnownProduct> = {}): KnownProduct => ({
  id: "p33",
  name: "Commercial Heat Pump 33 kW",
  modelCode: "CHP-33",
  capacityKw: 33,
  active: true,
  isSparePart: false,
  warrantyMonths: 24,
  ...over,
});

const known = (over: Partial<PlanKnown> = {}): PlanKnown => ({
  customers: [],
  products: [product()],
  serials: new Set(),
  machineCounts: new Map(),
  ...over,
});

const customer = (over: Partial<KnownCustomer> = {}): KnownCustomer => ({ id: "c1", name: "Ginger Pune", phone: "9800000001", address: "Baner, Pune", ...over });

describe("normaliseName and sameSite", () => {
  it("ignores case, punctuation, M/s and extra spaces, in any script", () => {
    expect(normaliseName("M/s  Hotel  GINGER, Pune.")).toBe("hotel ginger pune");
    expect(normaliseName("Hotel & Resort")).toBe("hotel and resort");
    expect(normaliseName("होटल जिंजर")).toBe("होटल जिंजर");
  });

  it("calls two places the same when one contains the other or they share a pincode, and different otherwise", () => {
    expect(sameSite("Pune", "Baner, Pune, Maharashtra")).toBe("same");
    expect(sameSite("Pune 411045", "Baner 411045")).toBe("same");
    expect(sameSite("Pune", "Nashik")).toBe("different");
    expect(sameSite("Pune", null)).toBe("unknown");
    expect(sameSite("", "Pune")).toBe("unknown");
  });
});

describe("matchCustomer", () => {
  it("finds a customer by name, whatever the case and punctuation", () => {
    const result = matchCustomer({ customerName: "ginger  pune", phone: "", address: null }, [customer()]);
    expect(result).toMatchObject({ kind: "match", customer: { id: "c1" } });
  });

  it("treats the hotels of one group in different cities as different customers", () => {
    const pool = [customer({ id: "pune", name: "Ginger", address: "Pune" }), customer({ id: "goa", name: "Ginger", address: "Goa" })];
    expect(matchCustomer({ customerName: "Ginger", phone: "", address: "Goa" }, pool)).toMatchObject({ kind: "match", customer: { id: "goa" } });
    expect(matchCustomer({ customerName: "Ginger", phone: "", address: "Nashik" }, pool)).toEqual({ kind: "none" });
  });

  it("does not guess between two customers with the same name when nothing tells them apart", () => {
    const pool = [customer({ id: "a", name: "Ginger", address: "Pune" }), customer({ id: "b", name: "Ginger", address: "Goa" })];
    expect(matchCustomer({ customerName: "Ginger", phone: "", address: null }, pool)).toMatchObject({ kind: "ambiguous" });
  });

  it("uses the phone number to pick between customers with the same name", () => {
    const pool = [customer({ id: "a", name: "Ginger", phone: "98000 00001", address: "Pune" }), customer({ id: "b", name: "Ginger", phone: "98000 00002", address: "Goa" })];
    expect(matchCustomer({ customerName: "Ginger", phone: "+91 9800000002", address: null }, pool)).toMatchObject({ kind: "match", customer: { id: "b" } });
  });

  it("matches a customer that has no address yet, and finds nothing for a new name", () => {
    expect(matchCustomer({ customerName: "Ginger Pune", phone: "", address: "Baner" }, [customer({ address: null })])).toMatchObject({ kind: "match" });
    expect(matchCustomer({ customerName: "Taj Goa", phone: "", address: null }, [customer()])).toEqual({ kind: "none" });
  });
});

describe("resolveProduct", () => {
  it("finds a catalogue model by its name or code, in any case", () => {
    const created = new Map<string, NewProduct>();
    expect(resolveProduct({ model: "chp-33", capacityKw: null, warrantyMonths: null }, [product()], created)).toEqual({ kind: "existing", id: "p33", name: "Commercial Heat Pump 33 kW" });
    expect(resolveProduct({ model: "Commercial Heat Pump 33 kW", capacityKw: null, warrantyMonths: null }, [product()], created)).toMatchObject({ kind: "existing", id: "p33" });
    expect(created.size).toBe(0);
  });

  it("finds a model by capacity only when exactly one active machine has it", () => {
    const created = new Map<string, NewProduct>();
    expect(resolveProduct({ model: null, capacityKw: 33, warrantyMonths: null }, [product()], created)).toMatchObject({ kind: "existing", id: "p33" });
    const two = [product(), product({ id: "pool33", name: "Pool Heat Pump 33 kW", modelCode: "PHP-33" })];
    expect(resolveProduct({ model: null, capacityKw: 33, warrantyMonths: null }, two, created)).toMatchObject({ kind: "new" });
  });

  it("plans a hidden catalogue entry for a model that is not in the catalogue, once per model", () => {
    const created = new Map<string, NewProduct>();
    const a = resolveProduct({ model: "Old Model X", capacityKw: 20, warrantyMonths: 36 }, [product()], created);
    const b = resolveProduct({ model: "old  model x", capacityKw: 20, warrantyMonths: null }, [product()], created);
    expect(a).toEqual(b);
    expect(created.size).toBe(1);
    expect([...created.values()][0]).toMatchObject({ name: "Old Model X", modelCode: "LEGACY-OLD-MODEL-X", capacityKw: 20, warrantyMonths: 36 });
  });

  it("names a model from its capacity, or says it is not recorded, and keeps the code unique", () => {
    const created = new Map<string, NewProduct>();
    resolveProduct({ model: null, capacityKw: 7.5, warrantyMonths: null }, [], created);
    resolveProduct({ model: null, capacityKw: null, warrantyMonths: null }, [], created);
    expect([...created.values()].map((p) => p.name)).toEqual(["Heat pump 7.5 kW", "Heat pump (model not recorded)"]);
    const taken = [product({ id: "x", name: "Other", modelCode: "LEGACY-OLD-MODEL-X" })];
    resolveProduct({ model: "Old Model X", capacityKw: null, warrantyMonths: null }, taken, created);
    expect(created.get("legacy:oldmodelx")?.modelCode).toBe("LEGACY-OLD-MODEL-X-2");
  });
});

describe("warrantyDates", () => {
  const base = { installedOn: "2023-03-15", warrantyMonths: null, warrantyEndsOn: null };

  it("uses the model's usual period when the row gives none", () => {
    expect(warrantyDates(base, 24)).toEqual({ startsOn: "2023-03-15", endsOn: "2025-03-15" });
    expect(warrantyDates(base, 0)).toEqual({ startsOn: "2023-03-15", endsOn: "2024-03-15" });
  });

  it("uses the row's period, or its exact end date, or no warranty at all", () => {
    expect(warrantyDates({ ...base, warrantyMonths: 12 }, 24).endsOn).toBe("2024-03-15");
    expect(warrantyDates({ ...base, warrantyMonths: 12, warrantyEndsOn: "2027-01-01" }, 24).endsOn).toBe("2027-01-01");
    expect(warrantyDates({ ...base, warrantyMonths: 0 }, 24).endsOn).toBe("2023-03-15");
    expect(warrantyDates({ ...base, installedOn: "2024-01-31", warrantyMonths: 1 }, 24).endsOn).toBe("2024-02-29");
  });
});

describe("buildPlan", () => {
  it("plans a new customer with a machine of a catalogue model, and the warranty from the model", () => {
    const plan = buildPlan([row({ model: "CHP-33", quantity: 2 })], known());
    expect(plan.problems).toEqual([]);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({
      customer: { kind: "new" },
      product: { kind: "existing", id: "p33" },
      generate: 2,
      serials: [],
      warrantyStartsOn: "2023-03-15",
      warrantyEndsOn: "2025-03-15",
    });
    expect(plan.totals).toEqual({ machines: 2, customersNew: 1, customersMatched: 0, amcContracts: 0, newModels: 0 });
  });

  it("puts the rows of one hotel under one new customer and counts different hotels apart", () => {
    const plan = buildPlan(
      [
        row({ line: 2, customerName: "Ginger", address: "Pune", capacityKw: 33 }),
        row({ line: 3, customerName: "ginger", address: "Pune", capacityKw: 33, installedOn: "2024-01-10" }),
        row({ line: 4, customerName: "Ginger", address: "Goa", capacityKw: 33 }),
      ],
      known(),
    );
    expect(plan.totals.customersNew).toBe(2);
    expect(plan.items.map((i) => (i.customer.kind === "new" ? i.customer.key : ""))).toEqual([
      plan.items[0].customer.kind === "new" ? plan.items[0].customer.key : "",
      plan.items[0].customer.kind === "new" ? plan.items[0].customer.key : "",
      expect.not.stringMatching(/pune/),
    ]);
  });

  it("matches an existing customer and counts it", () => {
    const plan = buildPlan([row({ customerName: "ginger pune" })], known({ customers: [customer()] }));
    expect(plan.items[0].customer).toMatchObject({ kind: "existing", id: "c1", fillAddress: null });
    expect(plan.totals).toMatchObject({ customersNew: 0, customersMatched: 1 });
  });

  it("gives an existing customer without an address the address of the row, and then tells later rows apart by it", () => {
    const plan = buildPlan(
      [row({ line: 2, customerName: "Ginger", address: "Pune" }), row({ line: 3, customerName: "Ginger", address: "Goa" })],
      known({ customers: [customer({ name: "Ginger", address: null })] }),
    );
    expect(plan.items[0].customer).toMatchObject({ kind: "existing", id: "c1", fillAddress: "Pune" });
    expect(plan.items[1].customer.kind).toBe("new");
  });

  it("reports a row it cannot place instead of guessing", () => {
    const plan = buildPlan([row({ customerName: "Ginger" })], known({ customers: [customer({ id: "a", name: "Ginger", address: "Pune" }), customer({ id: "b", name: "Ginger", address: "Goa" })] }));
    expect(plan.items).toEqual([]);
    expect(plan.problems[0]).toMatchObject({ line: 2 });
    expect(plan.problems[0].message).toMatch(/several customers/);
  });

  it("plans a hidden catalogue entry for an unknown model and counts it", () => {
    const plan = buildPlan([row({ model: "Old Model X", capacityKw: 20, warrantyMonths: 36 })], known());
    expect(plan.totals.newModels).toBe(1);
    expect(plan.items[0].product.kind).toBe("new");
    expect(plan.items[0].warrantyEndsOn).toBe("2026-03-15");
  });

  it("skips a row whose serial number is already in the CRM, and a repeat of machines already on record", () => {
    const withSerial = buildPlan([row({ model: "CHP-33", serials: ["SN-1"], quantity: 1 })], known({ serials: new Set(["sn-1"]) }));
    expect(withSerial.items).toEqual([]);
    expect(withSerial.skipped[0].message).toMatch(/SN-1/);

    const onRecord = known({ customers: [customer()], machineCounts: new Map([[machineKey("c1", "p33", "2023-03-15"), 2]]) });
    const repeat = buildPlan([row({ model: "CHP-33", quantity: 2 })], onRecord);
    expect(repeat.items).toEqual([]);
    expect(repeat.skipped[0].message).toMatch(/already on record/);

    const more = buildPlan([row({ model: "CHP-33", quantity: 3 })], onRecord);
    expect(more.items[0].generate).toBe(1);
  });

  it("does not add the same serial number twice in one file, nor the same machines when a file lists a row twice", () => {
    const serials = buildPlan([row({ line: 2, serials: ["A1"], model: "CHP-33" }), row({ line: 3, serials: ["a1"], model: "CHP-33" })], known());
    expect(serials.items).toHaveLength(1);
    expect(serials.skipped).toHaveLength(1);

    const twice = buildPlan([row({ line: 2, model: "CHP-33" }), row({ line: 3, model: "CHP-33" })], known());
    expect(twice.items).toHaveLength(1);
    expect(twice.skipped).toHaveLength(1);
  });

  it("carries a maintenance contract along and counts it", () => {
    const amc = { startDate: "2025-03-15", endDate: "2026-03-14", amount: 85000, visitsPerYear: 4, coveredParts: null };
    const plan = buildPlan([row({ model: "CHP-33", amc })], known());
    expect(plan.items[0].amc).toEqual(amc);
    expect(plan.totals.amcContracts).toBe(1);
  });

  it("does not create a customer or model that only appears in rows that were left out", () => {
    const plan = buildPlan([row({ model: "Old Model X", serials: ["A1"] })], known({ serials: new Set(["a1"]) }));
    expect(plan.items).toEqual([]);
    expect(plan.newCustomers.size).toBe(0);
    expect(plan.newProducts.size).toBe(0);
  });
});
