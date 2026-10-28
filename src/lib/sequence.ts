import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export function formatDocNumber(prefix: string, year: number, value: number): string {
  return `${prefix}-${year}-${value.toString().padStart(4, "0")}`;
}

/**
 * Next human-readable document number, e.g. SO-2026-0001. The counter is incremented atomically in the
 * database, so two people creating a record at the same moment never receive the same number.
 */
export async function nextNumber(
  prefix: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
  now: Date = new Date(),
): Promise<string> {
  const year = now.getFullYear();
  const key = `${prefix}-${year}`;
  const row = await client.sequence.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return formatDocNumber(prefix, year, row.value);
}
