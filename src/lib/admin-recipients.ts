import type { Prisma } from "@prisma/client";

/**
 * Which administrators the daily update goes to: every active administrator whose switch (Settings, Daily update for
 * administrators) is on. When one administrator asks for it themselves (the "send me today's update now" button) it
 * goes to that person whatever the switch says, so they can always check that it arrives.
 */
export function dailyUpdateRecipients(onlyUserId?: string): Prisma.UserWhereInput {
  if (onlyUserId) return { id: onlyUserId, role: "ADMIN", active: true };
  return { role: "ADMIN", active: true, receivesDailyUpdate: true };
}
