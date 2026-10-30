import { describe, expect, it } from "vitest";
import { amountInWords } from "@/lib/amount-in-words";

describe("amountInWords", () => {
  it("writes whole rupees with Indian place values", () => {
    expect(amountInWords(18)).toBe("Rupees Eighteen Only");
    expect(amountInWords(100)).toBe("Rupees One Hundred Only");
    expect(amountInWords(325000)).toBe("Rupees Three Lakh Twenty Five Thousand Only");
    expect(amountInWords(1250000)).toBe("Rupees Twelve Lakh Fifty Thousand Only");
    expect(amountInWords(12345678)).toBe(
      "Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight Only",
    );
  });

  it("adds paise when there are any", () => {
    expect(amountInWords(1499.5)).toBe("Rupees One Thousand Four Hundred Ninety Nine and Fifty Paise Only");
    expect(amountInWords(0.5)).toBe("Fifty Paise Only");
  });

  it("handles zero and rounding to the nearest paisa", () => {
    expect(amountInWords(0)).toBe("Rupees Zero Only");
    expect(amountInWords(100.004)).toBe("Rupees One Hundred Only");
  });

  it("copes with very large amounts", () => {
    expect(amountInWords(1_500_000_000)).toBe("Rupees One Hundred Fifty Crore Only");
  });
});
