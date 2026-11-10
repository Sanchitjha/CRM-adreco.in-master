import { describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import {
  ATTACHMENT_MAX_BYTES,
  attachmentKey,
  attachmentPath,
  attachmentRights,
  checkUpload,
  formatBytes,
  isAttachmentEntity,
  keyBelongsTo,
  resolveContentType,
  safeFileName,
  type AttachmentFacts,
} from "./attachments";

const MB = 1024 * 1024;

describe("resolveContentType", () => {
  it("accepts the types a browser reports for photos, videos and documents", () => {
    expect(resolveContentType("a.jpg", "image/jpeg")).toBe("image/jpeg");
    expect(resolveContentType("a.mp4", "video/mp4")).toBe("video/mp4");
    expect(resolveContentType("a.pdf", "application/pdf")).toBe("application/pdf");
  });

  it("ignores a charset suffix and letter case", () => {
    expect(resolveContentType("a.pdf", "Application/PDF; charset=utf-8")).toBe("application/pdf");
  });

  it("falls back to the extension when the browser reports nothing useful", () => {
    expect(resolveContentType("IMG_0001.HEIC", "")).toBe("image/heic");
    expect(resolveContentType("clip.MOV", "application/octet-stream")).toBe("video/quicktime");
    expect(resolveContentType("sheet.xlsx", undefined)).toContain("spreadsheetml");
  });

  it("refuses what is not a photo, video or document", () => {
    expect(resolveContentType("page.html", "text/html")).toBeNull();
    expect(resolveContentType("logo.svg", "image/svg+xml")).toBeNull();
    expect(resolveContentType("tool.exe", "application/x-msdownload")).toBeNull();
    expect(resolveContentType("noextension", "")).toBeNull();
  });
});

describe("checkUpload", () => {
  it("accepts a normal photo and says what kind it is", () => {
    expect(checkUpload({ fileName: "site.jpg", contentType: "image/jpeg", size: 3 * MB })).toEqual({
      ok: true,
      contentType: "image/jpeg",
      kind: "photo",
    });
  });

  it("gives each kind its own size limit", () => {
    expect(checkUpload({ fileName: "a.jpg", contentType: "image/jpeg", size: ATTACHMENT_MAX_BYTES.photo + 1 }).ok).toBe(false);
    expect(checkUpload({ fileName: "a.mp4", contentType: "video/mp4", size: 100 * MB }).ok).toBe(true);
    expect(checkUpload({ fileName: "a.mp4", contentType: "video/mp4", size: ATTACHMENT_MAX_BYTES.video + 1 }).ok).toBe(false);
    expect(checkUpload({ fileName: "a.pdf", contentType: "application/pdf", size: 26 * MB }).ok).toBe(false);
  });

  it("names the limit in the message", () => {
    const r = checkUpload({ fileName: "a.jpg", contentType: "image/jpeg", size: 16 * MB });
    expect(r.ok === false && r.error).toContain("15 MB");
  });

  it("refuses empty files and unknown types", () => {
    expect(checkUpload({ fileName: "a.jpg", contentType: "image/jpeg", size: 0 }).ok).toBe(false);
    expect(checkUpload({ fileName: "a.html", contentType: "text/html", size: 10 }).ok).toBe(false);
  });
});

describe("safeFileName", () => {
  it("drops folders and odd characters but keeps the extension", () => {
    expect(safeFileName("C:\\Users\\me\\Site photo 1.JPG")).toBe("Site photo 1.JPG");
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName('a"b<c>d.png')).toBe("a_b_c_d.png");
  });

  it("never returns an empty name or a hidden file", () => {
    expect(safeFileName("")).toBe("file");
    expect(safeFileName("...")).toBe("file");
    expect(safeFileName(".env")).toBe("env");
  });

  it("shortens a very long name without losing the extension", () => {
    const out = safeFileName(`${"x".repeat(300)}.jpeg`);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith(".jpeg")).toBe(true);
  });
});

describe("keys", () => {
  it("keeps files under leads/, the only folder the app may write to", () => {
    const key = attachmentKey("SITE_SURVEY", "abc", "id1", "roof view.jpg");
    expect(key).toBe("leads/attachments/site_survey/abc/id1-roof view.jpg");
    expect(key.startsWith("leads/")).toBe(true);
  });

  it("recognises a key made for this item and upload", () => {
    const key = attachmentKey("PRODUCT", "p1", "u1", "a.jpg");
    expect(keyBelongsTo(key, "PRODUCT", "p1", "u1")).toBe(true);
  });

  it("rejects a key from another item, another upload, or one that climbs out", () => {
    const key = attachmentKey("PRODUCT", "p1", "u1", "a.jpg");
    expect(keyBelongsTo(key, "PRODUCT", "p2", "u1")).toBe(false);
    expect(keyBelongsTo(key, "PRODUCT", "p1", "u2")).toBe(false);
    expect(keyBelongsTo(key, "SERVICE_TICKET", "p1", "u1")).toBe(false);
    expect(keyBelongsTo("leads/attachments/product/p1/u1-../../x", "PRODUCT", "p1", "u1")).toBe(false);
  });
});

describe("entities and paths", () => {
  it("knows the four kinds of item", () => {
    expect(isAttachmentEntity("PRODUCT")).toBe(true);
    expect(isAttachmentEntity("LEAD")).toBe(false);
    expect(isAttachmentEntity(42)).toBe(false);
  });

  it("sends each kind back to its own page", () => {
    expect(attachmentPath("PRODUCT", "1")).toBe("/products/1");
    expect(attachmentPath("SITE_SURVEY", "1")).toBe("/surveys/1");
    expect(attachmentPath("INSTALLATION", "1")).toBe("/installations/1");
    expect(attachmentPath("SERVICE_TICKET", "1")).toBe("/tickets/1");
  });
});

function facts(role: Role, over: Partial<AttachmentFacts> = {}): AttachmentFacts {
  return { role, userId: "me", moduleView: true, moduleManage: false, leadVisible: true, ...over };
}

describe("attachmentRights", () => {
  it("shows nothing to someone who cannot open the module or the lead", () => {
    expect(attachmentRights("PRODUCT", facts("SALES", { moduleView: false }))).toEqual({ view: false, upload: false, removeAny: false });
    expect(attachmentRights("INSTALLATION", facts("SALES", { leadVisible: false })).view).toBe(false);
  });

  it("lets everyone see product files but only managers add or remove them", () => {
    expect(attachmentRights("PRODUCT", facts("SALES"))).toEqual({ view: true, upload: false, removeAny: false });
    expect(attachmentRights("PRODUCT", facts("DESIGN", { moduleManage: true }))).toEqual({ view: true, upload: true, removeAny: true });
  });

  it("follows the survey page: staff, the surveyor, and the sales rep who owns the lead", () => {
    expect(attachmentRights("SITE_SURVEY", facts("ADMIN"))).toEqual({ view: true, upload: true, removeAny: true });
    expect(attachmentRights("SITE_SURVEY", facts("SALES", { assignedToId: "me" }))).toEqual({ view: true, upload: true, removeAny: false });
    expect(attachmentRights("SITE_SURVEY", facts("SALES", { assignedToId: "other", leadOwnerId: "me" }))).toEqual({
      view: true,
      upload: false,
      removeAny: false,
    });
    expect(attachmentRights("SITE_SURVEY", facts("SALES", { assignedToId: "other", leadOwnerId: "other" })).view).toBe(false);
  });

  it("lets the assigned technician add installation photos without managing the job", () => {
    expect(attachmentRights("INSTALLATION", facts("INSTALLATION", { assignedToId: "me" }))).toEqual({ view: true, upload: true, removeAny: false });
    expect(attachmentRights("INSTALLATION", facts("INSTALLATION", { assignedToId: "other" })).upload).toBe(false);
    expect(attachmentRights("INSTALLATION", facts("ADMIN", { moduleManage: true })).removeAny).toBe(true);
  });

  it("lets whoever raised or was given a ticket add photos to it", () => {
    expect(attachmentRights("SERVICE_TICKET", facts("SALES", { createdById: "me" })).upload).toBe(true);
    expect(attachmentRights("SERVICE_TICKET", facts("SERVICE", { assignedToId: "me" })).upload).toBe(true);
    expect(attachmentRights("SERVICE_TICKET", facts("SALES", { createdById: "other", assignedToId: "other" })).upload).toBe(false);
  });
});

describe("formatBytes", () => {
  it("writes sizes the way people read them", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(3 * MB)).toBe("3.0 MB");
    expect(formatBytes(120 * MB)).toBe("120 MB");
  });
});
