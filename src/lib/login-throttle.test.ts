import { describe, expect, it } from "vitest";
import { MAX_FAILURES_PER_EMAIL, MAX_FAILURES_PER_IP, clientIp, isLockedOut } from "@/lib/login-throttle";

describe("isLockedOut", () => {
  it("allows a few mistakes", () => {
    expect(isLockedOut(MAX_FAILURES_PER_EMAIL - 1, 0)).toBe(false);
  });

  it("locks an account after repeated failures on one email", () => {
    expect(isLockedOut(MAX_FAILURES_PER_EMAIL, 0)).toBe(true);
  });

  it("blocks an address that is guessing across many emails", () => {
    expect(isLockedOut(1, MAX_FAILURES_PER_IP)).toBe(true);
    expect(isLockedOut(1, MAX_FAILURES_PER_IP - 1)).toBe(false);
  });
});

describe("clientIp", () => {
  it("takes the last address, which is the one the load balancer appended", () => {
    expect(clientIp("203.0.113.9, 10.0.1.5")).toBe("10.0.1.5");
    expect(clientIp("203.0.113.9")).toBe("203.0.113.9");
  });

  it("returns null when there is no header", () => {
    expect(clientIp(null)).toBeNull();
    expect(clientIp("")).toBeNull();
  });
});
