import { describe, expect, it } from "vitest";
import { dailyUpdateRecipients } from "@/lib/admin-recipients";

describe("dailyUpdateRecipients", () => {
  it("is every active administrator whose switch is on", () => {
    expect(dailyUpdateRecipients()).toEqual({ role: "ADMIN", active: true, receivesDailyUpdate: true });
  });

  it("never includes people who are not administrators or are deactivated", () => {
    const where = dailyUpdateRecipients();
    expect(where.role).toBe("ADMIN");
    expect(where.active).toBe(true);
  });

  it("sends to the one administrator who asked, whatever their switch says", () => {
    const where = dailyUpdateRecipients("admin-1");
    expect(where).toEqual({ id: "admin-1", role: "ADMIN", active: true });
    expect(where).not.toHaveProperty("receivesDailyUpdate");
  });

  it("still only ever sends to an active administrator, even when asked for by id", () => {
    const where = dailyUpdateRecipients("someone");
    expect(where.role).toBe("ADMIN");
    expect(where.active).toBe(true);
  });
});
