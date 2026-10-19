import { describe, expect, it } from "vitest";
import { nextDepartmentName } from "@/lib/department-pipeline";

describe("nextDepartmentName", () => {
  it("walks the pipeline in order", () => {
    expect(nextDepartmentName("Sales")).toBe("Design & Engineering");
    expect(nextDepartmentName("Design & Engineering")).toBe("Accounts");
    expect(nextDepartmentName("Accounts")).toBe("Installation");
    expect(nextDepartmentName("Installation")).toBe("Service");
  });

  it("returns null after the last stage", () => {
    expect(nextDepartmentName("Service")).toBeNull();
  });

  it("returns null for an unknown department name", () => {
    expect(nextDepartmentName("Marketing")).toBeNull();
  });
});
