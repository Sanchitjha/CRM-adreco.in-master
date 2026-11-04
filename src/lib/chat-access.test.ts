import { describe, expect, it } from "vitest";
import {
  GROUP_ALL_KEY,
  canOpenLead,
  channelAccess,
  directChannelKey,
  directParticipants,
  groupRoleKey,
  leadChannelKey,
  type ChatChannelInfo,
  type ChatLeadInfo,
} from "@/lib/chat-access";

const admin = { id: "admin-1", role: "ADMIN" as const };
const sales = { id: "sales-1", role: "SALES" as const };
const otherSales = { id: "sales-2", role: "SALES" as const };
const design = { id: "design-1", role: "DESIGN" as const };

describe("direct conversation keys", () => {
  it("is the same whichever person starts the conversation", () => {
    expect(directChannelKey("a", "b")).toBe(directChannelKey("b", "a"));
    expect(directChannelKey("a", "b")).toBe("dm:a:b");
  });

  it("reads the two people back out", () => {
    expect(directParticipants(directChannelKey("zed", "amy"))).toEqual(["amy", "zed"]);
  });

  it("rejects keys that are not direct keys", () => {
    expect(directParticipants("group:all")).toBeNull();
    expect(directParticipants("dm:only-one")).toBeNull();
    expect(directParticipants("dm:a:b:c")).toBeNull();
    expect(directParticipants("dm::b")).toBeNull();
  });

  it("builds stable keys for groups and leads", () => {
    expect(GROUP_ALL_KEY).toBe("group:all");
    expect(groupRoleKey("SALES")).toBe("group:role:SALES");
    expect(leadChannelKey("L1")).toBe("lead:L1");
  });
});

describe("canOpenLead", () => {
  const unconverted: ChatLeadInfo = { assignedToId: "sales-1", currentDepartmentName: null };
  const inDesign: ChatLeadInfo = { assignedToId: "sales-1", currentDepartmentName: "Design & Engineering" };

  it("lets an admin open any lead", () => {
    expect(canOpenLead(admin, unconverted)).toBe(true);
  });

  it("lets only the owning sales rep open a lead that has not been converted", () => {
    expect(canOpenLead(sales, unconverted)).toBe(true);
    expect(canOpenLead(otherSales, unconverted)).toBe(false);
  });

  it("lets the department that holds a converted lead open it, and nobody else", () => {
    expect(canOpenLead(design, inDesign)).toBe(true);
    expect(canOpenLead({ id: "acc-1", role: "ACCOUNTS" }, inDesign)).toBe(false);
    expect(canOpenLead(design, unconverted)).toBe(false);
  });
});

describe("channelAccess", () => {
  const direct: ChatChannelInfo = { kind: "DIRECT", key: directChannelKey("sales-1", "design-1"), audienceRole: null };

  it("gives both people in a direct conversation full access", () => {
    expect(channelAccess(sales, direct, null)).toEqual({ canRead: true, canWrite: true, oversight: false });
    expect(channelAccess(design, direct, null)).toEqual({ canRead: true, canWrite: true, oversight: false });
  });

  it("keeps a direct conversation private from everyone else", () => {
    expect(channelAccess(otherSales, direct, null)).toEqual({ canRead: false, canWrite: false, oversight: false });
  });

  it("lets an admin read a direct conversation, read-only and flagged as oversight", () => {
    expect(channelAccess(admin, direct, null)).toEqual({ canRead: true, canWrite: false, oversight: true });
  });

  it("does not flag oversight when the admin is one of the two people", () => {
    const withAdmin: ChatChannelInfo = { kind: "DIRECT", key: directChannelKey("admin-1", "sales-1"), audienceRole: null };
    expect(channelAccess(admin, withAdmin, null)).toEqual({ canRead: true, canWrite: true, oversight: false });
  });

  it("refuses a direct conversation whose key is malformed", () => {
    expect(channelAccess(admin, { kind: "DIRECT", key: "dm:broken", audienceRole: null }, null).canRead).toBe(false);
  });

  it("opens the everyone group to every role", () => {
    const all: ChatChannelInfo = { kind: "GROUP", key: GROUP_ALL_KEY, audienceRole: null };
    for (const viewer of [admin, sales, design]) {
      expect(channelAccess(viewer, all, null)).toEqual({ canRead: true, canWrite: true, oversight: false });
    }
  });

  it("limits a role group to that role and the admins", () => {
    const salesRoom: ChatChannelInfo = { kind: "GROUP", key: groupRoleKey("SALES"), audienceRole: "SALES" };
    expect(channelAccess(sales, salesRoom, null).canWrite).toBe(true);
    expect(channelAccess(admin, salesRoom, null).canWrite).toBe(true);
    expect(channelAccess(design, salesRoom, null).canRead).toBe(false);
  });

  it("follows the lead's own visibility for a lead thread", () => {
    const thread: ChatChannelInfo = { kind: "LEAD", key: leadChannelKey("L1"), audienceRole: null };
    const lead: ChatLeadInfo = { assignedToId: "sales-1", currentDepartmentName: null };
    expect(channelAccess(sales, thread, lead).canWrite).toBe(true);
    expect(channelAccess(admin, thread, lead).canWrite).toBe(true);
    expect(channelAccess(otherSales, thread, lead).canRead).toBe(false);
    expect(channelAccess(design, thread, lead).canRead).toBe(false);
  });

  it("refuses a lead thread when the lead is unknown", () => {
    const thread: ChatChannelInfo = { kind: "LEAD", key: leadChannelKey("L1"), audienceRole: null };
    expect(channelAccess(admin, thread, null).canRead).toBe(false);
  });
});
