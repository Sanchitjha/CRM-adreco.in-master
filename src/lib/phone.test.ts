import { describe, expect, it } from "vitest";
import { whatsappUrl } from "@/lib/phone";

describe("whatsappUrl", () => {
  it("adds the country code to ten-digit Indian numbers", () => {
    expect(whatsappUrl("98765 43210")).toBe("https://wa.me/919876543210");
    expect(whatsappUrl("098765-43210")).toBe("https://wa.me/919876543210");
  });

  it("keeps numbers that already carry a country code", () => {
    expect(whatsappUrl("+91 98765 43210")).toBe("https://wa.me/919876543210");
    expect(whatsappUrl("+44 7911 123456")).toBe("https://wa.me/447911123456");
  });

  it("gives nothing for numbers that are too short", () => {
    expect(whatsappUrl("12345")).toBeNull();
    expect(whatsappUrl("")).toBeNull();
  });
});
