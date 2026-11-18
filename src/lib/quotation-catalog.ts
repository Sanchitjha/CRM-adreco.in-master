import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { canSeePricing } from "@/lib/rbac";
import type { CatalogProduct } from "@/lib/quotation-lines";

/**
 * The active catalog products a quotation can be built from. Prices are commercial, so only the roles that may see
 * them get the list. Decimals become plain numbers because the result goes to a client component.
 */
export async function loadCatalogProducts(role: Role): Promise<CatalogProduct[]> {
  if (!canSeePricing(role)) return [];
  const rows = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ isSparePart: "asc" }, { series: "asc" }, { heatingCapacityKw: "asc" }, { name: "asc" }],
    select: { id: true, name: true, modelCode: true, isSparePart: true, customerPrice: true },
  });
  return rows.map((p) => ({ ...p, customerPrice: p.customerPrice === null ? null : Number(p.customerPrice) }));
}
