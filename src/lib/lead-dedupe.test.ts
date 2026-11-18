import { describe, expect, it } from "vitest";
import { describeEmailMatch, describePhoneMatch, isSameEmail, isSamePhone, phoneKey } from "@/lib/lead-dedupe";

describe("phoneKey", () => {
  it("keeps the last ten digits whatever the formatting", () => {
    expect(phoneKey("+91 98765 43210")).toBe("9876543210");
    expect(phoneKey("098765-43210")).toBe("9876543210");
    expect(phoneKey("(98765) 43210")).toBe("9876543210");
  });
});

describe("isSamePhone", () => {
  it("matches the same subscriber written differently", () => {
    expect(isSamePhone("+91 98765 43210", "9876543210")).toBe(true);
    expect(isSamePhone("98765-43210", "0 98765 43210")).toBe(true);
  });

  it("does not match different numbers", () => {
    expect(isSamePhone("9876543210", "9876543211")).toBe(false);
  });

  it("ignores numbers too short to identify anyone", () => {
    expect(isSamePhone("12345", "12345")).toBe(false);
  });
});

describe("isSameEmail", () => {
  it("compares case-insensitively", () => {
    expect(isSameEmail("Raj@Example.com", "raj@example.com ")).toBe(true);
  });

  it("is false when either side is missing", () => {
    expect(isSameEmail(null, "a@b.co")).toBe(false);
    expect(isSameEmail("", "")).toBe(false);
  });
});

describe("describePhoneMatch", () => {
  it("says when the number is the lead's own", () => {
    expect(describePhoneMatch({ phone: "9463354427", contactName: null, contactRole: null, source: "lead" })).toBe(
      "Same phone number (9463354427) as this lead's own number",
    );
  });

  it("names the person when the number is saved as another contact on the lead", () => {
    expect(
      describePhoneMatch({ phone: "98550 84749", contactName: "Rohit", contactRole: "Owner", source: "contact" }),
    ).toBe("Phone 98550 84749 is saved as a contact on this lead (Rohit, Owner)");
  });

  it("copes with a contact that has no role or no name", () => {
    expect(describePhoneMatch({ phone: "9855084749", contactName: "Rohit", contactRole: null, source: "contact" })).toBe(
      "Phone 9855084749 is saved as a contact on this lead (Rohit)",
    );
    expect(describePhoneMatch({ phone: "9855084749", contactName: null, contactRole: null, source: "contact" })).toBe(
      "Phone 9855084749 is saved as a contact on this lead",
    );
  });
});

describe("describeEmailMatch", () => {
  it("names the shared address", () => {
    expect(describeEmailMatch("a@b.co")).toBe("Same email address (a@b.co) as this lead");
  });
});
