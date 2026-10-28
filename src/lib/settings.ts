import type { TicketPriority } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PRODUCT_CATEGORIES } from "@/lib/validation/lead";

/** The editable pick-lists that appear across the CRM. */
export const OPTION_GROUPS = {
  LEAD_SOURCE: {
    label: "Lead sources",
    description: "Where enquiries come from. Suggested when a lead is created.",
    placeholder: "e.g. Trade fair",
  },
  PAYMENT_TERM: {
    label: "Payment terms",
    description: "Offered on sales orders.",
    placeholder: "e.g. 40% advance, 60% before dispatch",
  },
  PRODUCT_CATEGORY: {
    label: "Product categories",
    description: "Used for leads and the product catalog.",
    placeholder: "e.g. Solar Hybrid Heat Pump",
  },
  WARRANTY_PERIOD: {
    label: "Warranty periods (months)",
    description: "Choices for the warranty period on a product.",
    placeholder: "e.g. 18",
  },
  COMPLAINT_TYPE: {
    label: "Complaint types",
    description: "Used to classify service tickets.",
    placeholder: "e.g. Defrost problem",
  },
  TERRITORY: {
    label: "Territories and sales regions",
    description: "Used to assign dealers to a region.",
    placeholder: "e.g. Maharashtra",
  },
} as const;

export type OptionGroup = keyof typeof OPTION_GROUPS;
export const OPTION_GROUP_KEYS = Object.keys(OPTION_GROUPS) as OptionGroup[];

export function isOptionGroup(value: string): value is OptionGroup {
  return value in OPTION_GROUPS;
}

/** Active values for a pick-list, in the order set under Settings. */
export async function getOptions(group: OptionGroup): Promise<string[]> {
  const rows = await prisma.settingOption.findMany({
    where: { group, active: true },
    orderBy: [{ sortOrder: "asc" }, { value: "asc" }],
    select: { value: true },
  });
  const values = rows.map((r) => r.value);
  if (group === "PRODUCT_CATEGORY" && values.length === 0) return [...PRODUCT_CATEGORIES];
  return values;
}

export const DEFAULT_SLA_HOURS: Record<TicketPriority, number> = {
  CRITICAL: 4,
  HIGH: 24,
  MEDIUM: 48,
  LOW: 72,
};

/** Resolution target in hours for every ticket priority, falling back to the defaults for any missing row. */
export async function getSlaPolicies(): Promise<Record<TicketPriority, number>> {
  const rows = await prisma.slaPolicy.findMany();
  const policies = { ...DEFAULT_SLA_HOURS };
  for (const row of rows) policies[row.priority] = row.resolutionHours;
  return policies;
}

export async function getCompanyProfile() {
  return prisma.companyProfile.findUnique({ where: { id: "singleton" } });
}
