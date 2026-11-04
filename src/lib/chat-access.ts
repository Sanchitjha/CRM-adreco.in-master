import type { ChatChannelKind, Role } from "@prisma/client";
import { canAccessDepartment } from "@/lib/rbac";

/** Who is asking. */
export type ChatViewer = { id: string; role: Role };

/** What the access rules need to know about a conversation. */
export type ChatChannelInfo = {
  kind: ChatChannelKind;
  key: string;
  audienceRole: Role | null;
};

/** What the access rules need to know about the lead a LEAD conversation belongs to. */
export type ChatLeadInfo = {
  assignedToId: string | null;
  currentDepartmentName: string | null;
};

export type ChannelAccess = {
  /** May open the conversation and read it. */
  canRead: boolean;
  /** May post in it. An admin reading someone else's private conversation may not. */
  canWrite: boolean;
  /** An admin reading a private conversation they are not part of. These visits are recorded. */
  oversight: boolean;
};

export const NO_ACCESS: ChannelAccess = { canRead: false, canWrite: false, oversight: false };

export const GROUP_ALL_KEY = "group:all";

export function groupRoleKey(role: Role): string {
  return `group:role:${role}`;
}

export function leadChannelKey(leadId: string): string {
  return `lead:${leadId}`;
}

/** One key per pair of people, whichever of them starts the conversation. */
export function directChannelKey(a: string, b: string): string {
  return `dm:${[a, b].sort().join(":")}`;
}

/** The two people in a direct conversation, or null if the key is not a direct key. */
export function directParticipants(key: string): [string, string] | null {
  const parts = key.split(":");
  if (parts.length !== 3 || parts[0] !== "dm" || !parts[1] || !parts[2]) return null;
  return [parts[1], parts[2]];
}

/** The same rule the lead page uses: an admin, the sales rep who owns the lead, or the department that holds it now. */
export function canOpenLead(viewer: ChatViewer, lead: ChatLeadInfo): boolean {
  if (viewer.role === "ADMIN") return true;
  if (viewer.role === "SALES" && lead.assignedToId === viewer.id) return true;
  return canAccessDepartment(viewer.role, lead.currentDepartmentName);
}

/**
 * What a person may do in a conversation.
 * - Direct: the two people. Admins may also read it (read-only), which is flagged as oversight.
 * - Group: everyone, or everyone in one role; admins belong to every group.
 * - Lead: whoever may open that lead.
 */
export function channelAccess(viewer: ChatViewer, channel: ChatChannelInfo, lead: ChatLeadInfo | null): ChannelAccess {
  const isAdmin = viewer.role === "ADMIN";

  if (channel.kind === "DIRECT") {
    const people = directParticipants(channel.key);
    if (!people) return NO_ACCESS;
    if (people.includes(viewer.id)) return { canRead: true, canWrite: true, oversight: false };
    return isAdmin ? { canRead: true, canWrite: false, oversight: true } : NO_ACCESS;
  }

  if (channel.kind === "GROUP") {
    const member = isAdmin || channel.audienceRole === null || channel.audienceRole === viewer.role;
    return member ? { canRead: true, canWrite: true, oversight: false } : NO_ACCESS;
  }

  // LEAD
  if (!lead || !canOpenLead(viewer, lead)) return NO_ACCESS;
  return { canRead: true, canWrite: true, oversight: false };
}
