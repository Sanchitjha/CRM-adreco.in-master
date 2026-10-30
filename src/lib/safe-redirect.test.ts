import { describe, expect, it } from "vitest";
import { safeCallbackPath } from "@/lib/safe-redirect";

describe("safeCallbackPath", () => {
  it("keeps paths inside the app, including their query string", () => {
    expect(safeCallbackPath("/leads")).toBe("/leads");
    expect(safeCallbackPath("/leads?view=table&q=sai")).toBe("/leads?view=table&q=sai");
  });

  it("falls back to the dashboard when there is nothing usable", () => {
    expect(safeCallbackPath(null)).toBe("/");
    expect(safeCallbackPath("")).toBe("/");
    expect(safeCallbackPath("leads")).toBe("/");
  });

  it("refuses addresses that leave the site", () => {
    expect(safeCallbackPath("https://evil.example/login")).toBe("/");
    expect(safeCallbackPath("//evil.example")).toBe("/");
    expect(safeCallbackPath("/\\evil.example")).toBe("/");
    expect(safeCallbackPath("javascript:alert(1)")).toBe("/");
  });
});
