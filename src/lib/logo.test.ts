import { describe, expect, it } from "vitest";
import { LOGO_MAX_BYTES, isUploadedLogo, logoLinkForForm, resolveLogo, sniffImageType } from "./logo";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 9, 9, 9, 0x57, 0x45, 0x42, 0x50, 1]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const none = { link: undefined, remove: false, current: null, file: null };

describe("sniffImageType", () => {
  it("recognises PNG, JPEG and WebP by their first bytes", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });

  it("rejects SVG, text and empty input", () => {
    expect(sniffImageType(SVG)).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("hello"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });

  it("does not take a RIFF file that is not WebP for a WebP", () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 9, 9, 9, 9, 0x57, 0x41, 0x56, 0x45]);
    expect(sniffImageType(wav)).toBeNull();
  });
});

describe("resolveLogo", () => {
  it("turns an uploaded picture into a data URL", () => {
    const r = resolveLogo({ ...none, file: { size: PNG.byteLength, bytes: PNG } });
    expect(r).toEqual({ value: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}` });
  });

  it("lets an upload win over a typed link and over remove", () => {
    const r = resolveLogo({ ...none, link: "https://x.test/a.png", remove: true, file: { size: PNG.byteLength, bytes: PNG } });
    expect("value" in r && r.value?.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("refuses a file that is not a PNG, JPEG or WebP, whatever its name says", () => {
    const r = resolveLogo({ ...none, file: { size: SVG.byteLength, bytes: SVG } });
    expect(r).toEqual({ error: "The logo must be a PNG, JPEG or WebP picture." });
  });

  it("refuses a picture over the size limit", () => {
    const r = resolveLogo({ ...none, file: { size: LOGO_MAX_BYTES + 1, bytes: PNG } });
    expect("error" in r && r.error).toContain("400 KB");
  });

  it("treats an empty file input as no upload", () => {
    expect(resolveLogo({ ...none, link: "https://x.test/a.png", file: { size: 0, bytes: new Uint8Array() } })).toEqual({
      value: "https://x.test/a.png",
    });
  });

  it("removes the logo when asked", () => {
    expect(resolveLogo({ ...none, remove: true, current: "https://x.test/a.png" })).toEqual({ value: null });
  });

  it("uses a typed link", () => {
    expect(resolveLogo({ ...none, link: "  https://x.test/a.png " })).toEqual({ value: "https://x.test/a.png" });
  });

  it("keeps an uploaded picture when the link box is left empty", () => {
    const current = "data:image/png;base64,AAAA";
    expect(resolveLogo({ ...none, current })).toEqual({ value: current });
  });

  it("clears a saved link when the link box is emptied", () => {
    expect(resolveLogo({ ...none, current: "https://x.test/a.png" })).toEqual({ value: null });
  });

  it("replaces an uploaded picture with a typed link", () => {
    expect(resolveLogo({ ...none, link: "https://x.test/b.png", current: "data:image/png;base64,AAAA" })).toEqual({
      value: "https://x.test/b.png",
    });
  });
});

describe("helpers", () => {
  it("tells an uploaded picture from a link", () => {
    expect(isUploadedLogo("data:image/png;base64,AAAA")).toBe(true);
    expect(isUploadedLogo("https://x.test/a.png")).toBe(false);
    expect(isUploadedLogo(null)).toBe(false);
  });

  it("keeps a data URL out of the link box", () => {
    expect(logoLinkForForm("data:image/png;base64,AAAA")).toBe("");
    expect(logoLinkForForm("https://x.test/a.png")).toBe("https://x.test/a.png");
    expect(logoLinkForForm(null)).toBe("");
  });
});
