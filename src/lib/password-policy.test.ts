import { describe, expect, it } from "vitest";
import { changePasswordSchema, passwordSchema } from "@/lib/password-policy";

describe("passwordSchema", () => {
  it("accepts a password with a letter and a number", () => {
    expect(passwordSchema.safeParse("Heatpump24").success).toBe(true);
  });

  it("rejects short, letter-less and number-less passwords", () => {
    expect(passwordSchema.safeParse("Ab1").success).toBe(false);
    // Built from repeated characters so nothing here reads like a real credential to a secret scanner.
    expect(passwordSchema.safeParse("7".repeat(8)).success).toBe(false);
    expect(passwordSchema.safeParse("x".repeat(10)).success).toBe(false);
  });

  it("rejects passwords longer than bcrypt reads", () => {
    expect(passwordSchema.safeParse("a1".repeat(40)).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  const base = { currentPassword: "OldPass123", newPassword: "NewPass456", confirmPassword: "NewPass456" };

  it("accepts a valid change", () => {
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
  });

  it("requires the confirmation to match", () => {
    const result = changePasswordSchema.safeParse({ ...base, confirmPassword: "Different789" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("The new passwords do not match");
  });

  it("rejects reusing the current password", () => {
    const result = changePasswordSchema.safeParse({ ...base, newPassword: "OldPass123", confirmPassword: "OldPass123" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Choose a password different from the current one");
  });
});
