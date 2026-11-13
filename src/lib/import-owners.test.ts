import { describe, expect, it } from "vitest";
import { resolveOwner, type OwnerCandidate } from "./import-owners";

const people: OwnerCandidate[] = [
  { id: "u1", email: "asha.rao@example.test", name: "Asha Rao" },
  { id: "u2", email: "ravi.k@example.test", name: "Ravi Kumar" },
  { id: "u3", email: "ravi.s@example.test", name: "Ravi Sharma" },
  { id: "u4", email: "meera@example.test", name: "Meera" },
];

describe("resolveOwner", () => {
  it("matches an email address, in any letter case", () => {
    expect(resolveOwner("ASHA.RAO@example.test", people)).toEqual({ ok: true, id: "u1" });
  });

  it("matches a full name, ignoring case, dots and extra spaces", () => {
    expect(resolveOwner("  asha   rao ", people)).toEqual({ ok: true, id: "u1" });
    expect(resolveOwner("Ravi K.", people)).toEqual({ ok: true, id: "u2" });
  });

  it("matches a first name when only one person has it", () => {
    expect(resolveOwner("Asha", people)).toEqual({ ok: true, id: "u1" });
    expect(resolveOwner("meera", people)).toEqual({ ok: true, id: "u4" });
  });

  it("will not guess between two people", () => {
    expect(resolveOwner("Ravi", people)).toEqual({ ok: false, reason: "more than one person" });
  });

  it("says when nobody fits", () => {
    expect(resolveOwner("Kavita", people)).toEqual({ ok: false, reason: "not found" });
    expect(resolveOwner("", people)).toEqual({ ok: false, reason: "not found" });
    expect(resolveOwner("???", people)).toEqual({ ok: false, reason: "not found" });
  });

  it("copes with names in other scripts", () => {
    const hindi: OwnerCandidate[] = [{ id: "h1", email: "h@example.test", name: "राहुल शर्मा" }];
    expect(resolveOwner("राहुल", hindi)).toEqual({ ok: true, id: "h1" });
  });
});
