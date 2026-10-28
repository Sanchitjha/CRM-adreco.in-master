"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type TicketPriority } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity-log";
import { requireUser } from "@/lib/action-auth";
import { canManage } from "@/lib/rbac";
import type { ActionState } from "@/lib/action-state";
import { firstIssueMessage, textOrNull } from "@/lib/validation/common";
import { addOptionSchema, companyProfileSchema, optionIdSchema, slaSchema } from "@/lib/validation/settings";

const DENIED: ActionState = { error: "Only an administrator can change settings." };

export async function updateCompanyProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "settings")) return DENIED;

  const parsed = companyProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const d = parsed.data;

  const data = {
    legalName: d.legalName,
    tradeName: textOrNull(d.tradeName),
    gstin: textOrNull(d.gstin),
    pan: textOrNull(d.pan),
    address: textOrNull(d.address),
    city: textOrNull(d.city),
    state: textOrNull(d.state),
    pincode: textOrNull(d.pincode),
    phone: textOrNull(d.phone),
    email: textOrNull(d.email),
    website: textOrNull(d.website),
    logoUrl: textOrNull(d.logoUrl),
    bankDetails: textOrNull(d.bankDetails),
  };

  await prisma.companyProfile.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  await logActivity({ userId: user.id, action: "COMPANY_PROFILE_UPDATED", entityType: "Settings", entityId: "company" });
  revalidatePath("/settings");
  return { message: "Company profile saved." };
}

export async function updateSlaPolicies(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "settings")) return DENIED;

  const parsed = slaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };

  const priorities = Object.keys(parsed.data) as TicketPriority[];
  await prisma.$transaction(
    priorities.map((priority) =>
      prisma.slaPolicy.upsert({
        where: { priority },
        create: { priority, resolutionHours: parsed.data[priority] },
        update: { resolutionHours: parsed.data[priority] },
      }),
    ),
  );

  await logActivity({
    userId: user.id,
    action: "SLA_POLICIES_UPDATED",
    entityType: "Settings",
    entityId: "sla",
    details: parsed.data,
  });
  revalidatePath("/settings");
  return { message: "SLA targets saved. They apply to tickets raised from now on." };
}

export async function addSettingOption(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "settings")) return DENIED;

  const parsed = addOptionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssueMessage(parsed.error.issues) };
  const { group, value } = parsed.data;

  if (group === "WARRANTY_PERIOD" && !/^\d{1,3}$/.test(value)) {
    return { error: "Enter the warranty period as a whole number of months, e.g. 18." };
  }

  const last = await prisma.settingOption.aggregate({ where: { group }, _max: { sortOrder: true } });
  try {
    await prisma.settingOption.create({
      data: { group, value, sortOrder: (last._max.sortOrder ?? 0) + 1 },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: `“${value}” is already in this list.` };
    }
    throw err;
  }

  await logActivity({
    userId: user.id,
    action: "SETTING_OPTION_ADDED",
    entityType: "Settings",
    entityId: group,
    details: { value },
  });
  revalidatePath("/settings");
  return { message: `Added “${value}”.` };
}

export async function toggleSettingOption(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "settings")) return DENIED;

  const parsed = optionIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const option = await prisma.settingOption.findUnique({ where: { id: parsed.data.id } });
  if (!option) return { error: "That option no longer exists." };

  await prisma.settingOption.update({ where: { id: option.id }, data: { active: !option.active } });
  await logActivity({
    userId: user.id,
    action: option.active ? "SETTING_OPTION_HIDDEN" : "SETTING_OPTION_SHOWN",
    entityType: "Settings",
    entityId: option.group,
    details: { value: option.value },
  });
  revalidatePath("/settings");
  return {};
}

export async function deleteSettingOption(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canManage(user.role, "settings")) return DENIED;

  const parsed = optionIdSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Invalid request." };

  const option = await prisma.settingOption.findUnique({ where: { id: parsed.data.id } });
  if (!option) return { error: "That option no longer exists." };

  // Records keep the text they were saved with, so removing a choice never breaks existing data.
  await prisma.settingOption.delete({ where: { id: option.id } });
  await logActivity({
    userId: user.id,
    action: "SETTING_OPTION_DELETED",
    entityType: "Settings",
    entityId: option.group,
    details: { value: option.value },
  });
  revalidatePath("/settings");
  return {};
}
