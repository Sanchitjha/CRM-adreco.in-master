import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function logActivity(params: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Prisma.InputJsonValue;
}) {
  await prisma.activityLog.create({ data: params });
}
