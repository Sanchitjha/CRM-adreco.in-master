/**
 * Loading what the CRM already holds for a set of installed-machine rows, and saving a plan made by installed-plan.ts.
 * The form on the Warranty page and the Excel import both go through here, so a machine is recorded the same way
 * whichever way it was entered.
 */
import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { nextNumber } from "@/lib/sequence";
import { buildVisitSchedule } from "@/lib/lifecycle";
import type { InstalledRow } from "@/lib/installed-base";
import { buildPlan, machineKey, type InstalledPlan, type KnownCustomer, type KnownProduct, type PlanKnown } from "@/lib/installed-plan";

/** The source of customers added from the installed base. */
export const EXISTING_CUSTOMER_SOURCE = "Existing customer";
/** The catalogue category of models that were only written down as text, and are hidden from new quotations. */
export const LEGACY_CATEGORY = "Existing installation";

const atMidnightUtc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

export type KnownForRows = PlanKnown & {
  /** Who owns each customer, so a salesperson is kept to their own. */
  ownerOf: Map<string, string | null>;
};

/** Everything in the CRM that decides what these rows would do: customers, models, serial numbers and machines on record. */
export async function loadKnown(rows: InstalledRow[]): Promise<KnownForRows> {
  const [leads, products, counts, serialRows] = await Promise.all([
    prisma.lead.findMany({ select: { id: true, customerName: true, phone: true, address: true, assignedToId: true } }),
    prisma.product.findMany({
      where: { isSparePart: false },
      select: { id: true, name: true, modelCode: true, heatingCapacityKw: true, active: true, isSparePart: true, warrantyMonths: true },
    }),
    prisma.serialNumber.groupBy({
      by: ["leadId", "productId", "commissionedAt"],
      where: { leadId: { not: null }, commissionedAt: { not: null } },
      _count: { _all: true },
    }),
    // Every serial number, compared without regard to case: a list of a few thousand at most.
    rows.some((r) => r.serials.length > 0) ? prisma.serialNumber.findMany({ select: { serialNo: true } }) : Promise.resolve([]),
  ]);

  const existing = new Set(serialRows.map((s) => s.serialNo.toLowerCase()));

  const customers: KnownCustomer[] = leads.map((l) => ({ id: l.id, name: l.customerName, phone: l.phone, address: l.address }));
  const knownProducts: KnownProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    modelCode: p.modelCode,
    capacityKw: p.heatingCapacityKw === null ? null : Number(p.heatingCapacityKw),
    active: p.active,
    isSparePart: p.isSparePart,
    warrantyMonths: p.warrantyMonths,
  }));
  const machineCounts = new Map<string, number>();
  for (const c of counts) {
    if (c.leadId && c.commissionedAt) machineCounts.set(machineKey(c.leadId, c.productId, isoDay(c.commissionedAt)), c._count._all);
  }

  return {
    customers,
    products: knownProducts,
    serials: existing,
    machineCounts,
    ownerOf: new Map(leads.map((l) => [l.id, l.assignedToId])),
  };
}

/**
 * A salesperson may add machines only to their own customers. Rows that landed on someone else's customer are taken
 * out of the plan and reported, and everything that depended only on them goes with them.
 */
export function keepToOwn(plan: InstalledPlan, userId: string, ownerOf: Map<string, string | null>): InstalledPlan {
  const foreign = plan.items.filter((i) => i.customer.kind === "existing" && ownerOf.get(i.customer.id) !== userId);
  if (foreign.length === 0) return plan;
  const keep = plan.items.filter((i) => !foreign.includes(i));
  const problems = [
    ...plan.problems,
    ...foreign.map((i) => ({ line: i.line, message: `${i.row.customerName}: this customer belongs to another salesperson. Ask an administrator to add the machines.` })),
  ];
  const usedCustomers = new Set(keep.flatMap((i) => (i.customer.kind === "new" ? [i.customer.key] : [])));
  const usedProducts = new Set(keep.flatMap((i) => (i.product.kind === "new" ? [i.product.key] : [])));
  const newCustomers = new Map([...plan.newCustomers].filter(([key]) => usedCustomers.has(key)));
  const newProducts = new Map([...plan.newProducts].filter(([key]) => usedProducts.has(key)));
  return {
    ...plan,
    items: keep,
    problems,
    newCustomers,
    newProducts,
    totals: {
      machines: keep.reduce((n, i) => n + i.serials.length + i.generate, 0),
      customersNew: newCustomers.size,
      customersMatched: new Set(keep.flatMap((i) => (i.customer.kind === "existing" ? [i.customer.id] : []))).size,
      amcContracts: keep.filter((i) => i.amc).length,
      newModels: newProducts.size,
    },
  };
}

/** Plans the rows against what the CRM holds. */
export async function planRows(rows: InstalledRow[], role: Role, userId: string): Promise<InstalledPlan> {
  const known = await loadKnown(rows);
  const plan = buildPlan(rows, known);
  return role === "SALES" ? keepToOwn(plan, userId, known.ownerOf) : plan;
}

export type SaveSummary = {
  machines: number;
  customers: number;
  amcContracts: number;
  models: number;
  /** The customers touched, in the order of the rows. */
  leadIds: string[];
  /** One machine of the first row, to link to. */
  firstSerialId: string | null;
};

/** Saves a plan in one step: either all of it is recorded or none of it. */
export async function savePlan(plan: InstalledPlan, who: { userId: string; role: Role }, now: Date = new Date()): Promise<SaveSummary> {
  const todayIso = isoDay(now);
  const summary: SaveSummary = { machines: 0, customers: 0, amcContracts: 0, models: 0, leadIds: [], firstSerialId: null };
  const logs: { serialId: string; details: Prisma.InputJsonObject }[] = [];

  await prisma.$transaction(
    async (tx) => {
      const productIds = new Map<string, string>();
      for (const p of plan.newProducts.values()) {
        const created = await tx.product.create({
          data: {
            name: p.name,
            modelCode: p.modelCode,
            category: LEGACY_CATEGORY,
            isSparePart: false,
            heatingCapacityKw: p.capacityKw,
            warrantyMonths: p.warrantyMonths,
            active: false,
          },
          select: { id: true },
        });
        productIds.set(p.key, created.id);
        summary.models += 1;
      }

      const leadIds = new Map<string, string>();
      for (const c of plan.newCustomers.values()) {
        const created = await tx.lead.create({
          data: {
            customerName: c.name,
            phone: c.phone,
            email: c.email,
            address: c.address,
            status: "CONVERTED",
            existingCustomer: true,
            source: EXISTING_CUSTOMER_SOURCE,
            createdById: who.userId,
            assignedToId: who.role === "SALES" ? who.userId : null,
            contacts: c.contactPerson ? { create: [{ name: c.contactPerson, role: "Contact person" }] } : undefined,
          },
          select: { id: true },
        });
        leadIds.set(c.key, created.id);
        summary.customers += 1;
      }

      for (const item of plan.items) {
        const leadId = item.customer.kind === "existing" ? item.customer.id : (leadIds.get(item.customer.key) as string);
        const productId = item.product.kind === "existing" ? item.product.id : (productIds.get(item.product.key) as string);
        if (item.customer.kind === "existing" && item.customer.fillAddress) {
          await tx.lead.updateMany({ where: { id: leadId, address: null }, data: { address: item.customer.fillAddress } });
        }
        if (!summary.leadIds.includes(leadId)) summary.leadIds.push(leadId);

        const serialNos = [...item.serials];
        for (let n = 0; n < item.generate; n += 1) serialNos.push(await nextNumber("REF", tx, now));

        const notes = [item.row.notes, item.generate > 0 ? "Serial number not recorded; the reference number was given by the CRM." : null].filter(Boolean).join(" ") || null;
        const machineIds: string[] = [];
        for (const serialNo of serialNos) {
          const machine = await tx.serialNumber.create({
            data: {
              serialNo,
              productId,
              status: "COMMISSIONED",
              leadId,
              installedAt: atMidnightUtc(item.row.installedOn),
              commissionedAt: atMidnightUtc(item.row.installedOn),
              warrantyStartsOn: atMidnightUtc(item.warrantyStartsOn),
              warrantyEndsOn: atMidnightUtc(item.warrantyEndsOn),
              notes,
            },
            select: { id: true },
          });
          machineIds.push(machine.id);
        }
        summary.machines += machineIds.length;
        summary.firstSerialId ??= machineIds[0] ?? null;

        if (item.amc && machineIds.length > 0) {
          const start = atMidnightUtc(item.amc.startDate);
          const end = atMidnightUtc(item.amc.endDate);
          // Visits that fell in the past are not put on the calendar as overdue; only the ones still to come are.
          const upcoming = buildVisitSchedule(start, end, item.amc.visitsPerYear).filter((d) => isoDay(d) >= todayIso);
          await tx.amcContract.create({
            data: {
              contractNumber: await nextNumber("AMC", tx, now),
              leadId,
              createdById: who.userId,
              startDate: start,
              endDate: end,
              visitsPerYear: item.amc.visitsPerYear,
              amount: item.amc.amount,
              coveredParts: item.amc.coveredParts,
              units: { create: machineIds.map((serialNumberId) => ({ serialNumberId })) },
              visits: { create: upcoming.map((scheduledFor) => ({ scheduledFor })) },
            },
          });
          summary.amcContracts += 1;
        }

        if (machineIds[0]) logs.push({ serialId: machineIds[0], details: { customer: item.row.customerName, machines: machineIds.length, line: item.line } });
      }
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  for (const l of logs) {
    await logActivity({ userId: who.userId, action: "INSTALLED_RECORDED", entityType: "SerialNumber", entityId: l.serialId, details: l.details });
  }
  return summary;
}
