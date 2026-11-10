/**
 * Photos, videos and files attached to products, site surveys, installations and service tickets. Pure rules only
 * (what may be uploaded, how big, where it is stored, who may do what); the database and S3 calls live in
 * src/app/(dashboard)/attachment-actions.ts.
 */
import type { Role } from "@prisma/client";

export const ATTACHMENT_ENTITIES = ["PRODUCT", "SITE_SURVEY", "INSTALLATION", "SERVICE_TICKET"] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITIES)[number];

export function isAttachmentEntity(value: unknown): value is AttachmentEntityType {
  return typeof value === "string" && (ATTACHMENT_ENTITIES as readonly string[]).includes(value);
}

export type AttachmentKind = "photo" | "video" | "file";

const MB = 1024 * 1024;

/** Largest file of each kind. Photos and videos go from the browser straight to S3, so these are not server limits. */
export const ATTACHMENT_MAX_BYTES: Record<AttachmentKind, number> = {
  photo: 15 * MB,
  video: 300 * MB,
  file: 25 * MB,
};

/** Enough for a site's worth of pictures, and a stop for a runaway upload loop. */
export const MAX_ATTACHMENTS_PER_ITEM = 60;

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/x-m4v"];
const FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

/** The value for the file picker's accept attribute. */
export const ATTACHMENT_ACCEPT = [...PHOTO_TYPES, ...VIDEO_TYPES, ...FILE_TYPES].join(",");

/** Some phones report no type, or a generic one, for HEIC photos and MOV videos; fall back to the file extension. */
const EXTENSION_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  webm: "video/webm",
  "3gp": "video/3gpp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** The type to store and to sign the upload with: what the browser said, or what the extension says. */
export function resolveContentType(fileName: string, reported: string | undefined): string | null {
  const type = (reported ?? "").toLowerCase().split(";")[0].trim();
  if (type && (PHOTO_TYPES.includes(type) || VIDEO_TYPES.includes(type) || FILE_TYPES.includes(type))) return type;
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_TYPES[ext] ?? null;
}

export function kindOfContentType(contentType: string): AttachmentKind | null {
  if (PHOTO_TYPES.includes(contentType)) return "photo";
  if (VIDEO_TYPES.includes(contentType)) return "video";
  if (FILE_TYPES.includes(contentType)) return "file";
  return null;
}

export type UploadCheck = { ok: true; contentType: string; kind: AttachmentKind } | { ok: false; error: string };

export function checkUpload(input: { fileName: string; contentType: string | undefined; size: number }): UploadCheck {
  const contentType = resolveContentType(input.fileName, input.contentType);
  const kind = contentType ? kindOfContentType(contentType) : null;
  if (!contentType || !kind) {
    return { ok: false, error: "That kind of file is not allowed. Use a photo, a video, a PDF or an Office document." };
  }
  if (!Number.isFinite(input.size) || input.size <= 0) return { ok: false, error: "That file is empty." };
  const max = ATTACHMENT_MAX_BYTES[kind];
  if (input.size > max) {
    const label = kind === "photo" ? "photos" : kind === "video" ? "videos" : "files";
    return { ok: false, error: `That file is too large. The limit for ${label} is ${Math.round(max / MB)} MB.` };
  }
  return { ok: true, contentType, kind };
}

/** A safe file name: no folders, no odd characters, never empty, never very long. The extension is kept. */
export function safeFileName(name: string): string {
  const base = name.replace(/^.*[\\/]/, "").normalize("NFKD");
  const cleaned = base.replace(/[^A-Za-z0-9._ -]+/g, "_").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  if (!cleaned) return "file";
  if (cleaned.length <= 100) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, 100 - ext.length) + ext;
}

/**
 * Where a file is stored. It sits under leads/ because that is the only folder of the bucket the running app may
 * read and write (see the task role in deploy/aws/adreco-crm-ha.yaml).
 */
export function attachmentPrefix(entityType: AttachmentEntityType, entityId: string): string {
  return `leads/attachments/${entityType.toLowerCase()}/${entityId}/`;
}

export function attachmentKey(entityType: AttachmentEntityType, entityId: string, id: string, fileName: string): string {
  return `${attachmentPrefix(entityType, entityId)}${id}-${safeFileName(fileName)}`;
}

/** True when a key was made by attachmentKey for this very item and upload, so a client cannot confirm someone else's file. */
export function keyBelongsTo(key: string, entityType: AttachmentEntityType, entityId: string, id: string): boolean {
  return key.startsWith(`${attachmentPrefix(entityType, entityId)}${id}-`) && !key.includes("..");
}

export function attachmentPath(entityType: AttachmentEntityType, entityId: string): string {
  switch (entityType) {
    case "PRODUCT":
      return `/products/${entityId}`;
    case "SITE_SURVEY":
      return `/surveys/${entityId}`;
    case "INSTALLATION":
      return `/installations/${entityId}`;
    case "SERVICE_TICKET":
      return `/tickets/${entityId}`;
  }
}

export type AttachmentRights = { view: boolean; upload: boolean; removeAny: boolean };

/** What the page's own rules already say about the item, as loaded by the caller. */
export type AttachmentFacts = {
  role: Role;
  userId: string;
  /** Can this role open the module at all (products, installations, tickets, surveys). */
  moduleView: boolean;
  /** Can this role change records in the module (products, installations, tickets). */
  moduleManage: boolean;
  /** For a sales rep: is the item's lead theirs. Other roles pass true. */
  leadVisible: boolean;
  /** Installation: the assigned technician. Ticket: the assignee. Survey: the person who surveyed. */
  assignedToId?: string | null;
  /** Ticket: who raised it. */
  createdById?: string | null;
  /** Survey: the lead's owner, for sales reps. */
  leadOwnerId?: string | null;
};

/**
 * Who may see, add and remove files, following the rules each page already applies. Anyone who added a file may
 * remove it themselves (decided separately, by the caller); `removeAny` is for those who manage the item.
 */
export function attachmentRights(entityType: AttachmentEntityType, f: AttachmentFacts): AttachmentRights {
  const none: AttachmentRights = { view: false, upload: false, removeAny: false };
  if (!f.moduleView || !f.leadVisible) return none;

  switch (entityType) {
    case "PRODUCT":
      return { view: true, upload: f.moduleManage, removeAny: f.moduleManage };
    case "SITE_SURVEY": {
      const staff = f.role === "ADMIN" || f.role === "DESIGN";
      const sales = f.role === "SALES" && (f.assignedToId === f.userId || f.leadOwnerId === f.userId);
      if (!staff && !sales) return none;
      const edit = staff || f.assignedToId === f.userId;
      return { view: true, upload: edit, removeAny: staff };
    }
    case "INSTALLATION":
      return { view: true, upload: f.moduleManage || f.assignedToId === f.userId, removeAny: f.moduleManage };
    case "SERVICE_TICKET":
      return {
        view: true,
        upload: f.moduleManage || f.assignedToId === f.userId || f.createdById === f.userId,
        removeAny: f.moduleManage,
      };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`;
}
