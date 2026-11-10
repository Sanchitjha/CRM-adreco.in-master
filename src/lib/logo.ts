/**
 * The company logo on the Settings page: either a link to an image hosted online or a small picture uploaded here.
 * An uploaded picture is kept in the database as a data URL, so it needs no storage setup and prints with the
 * quotation. Only PNG, JPEG and WebP are accepted: SVG files can carry scripts.
 */

/** Small enough to travel inside a form post (the server limit is 1 MB) and to sit in a text column. */
export const LOGO_MAX_BYTES = 400 * 1024;

export type LogoType = "image/png" | "image/jpeg" | "image/webp";

/** What the file really is, judged by its first bytes rather than by its name or the type the browser reported. */
export function sniffImageType(bytes: Uint8Array): LogoType | null {
  const startsWith = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  // WebP is a RIFF container: "RIFF" + 4 size bytes + "WEBP".
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export function isUploadedLogo(value: string | null | undefined): boolean {
  return !!value && value.startsWith("data:image/");
}

/** The value for the "Logo link" box: an uploaded picture is not a link, so the box stays empty for it. */
export function logoLinkForForm(value: string | null | undefined): string {
  return value && !isUploadedLogo(value) ? value : "";
}

export type LogoInput = {
  /** The file chosen in the form, if any (an empty file input is `null`). */
  file: { size: number; bytes: Uint8Array } | null;
  /** The text in the "Logo link" box. */
  link: string | undefined;
  /** The "Remove the current logo" tick-box. */
  remove: boolean;
  /** What is saved now. */
  current: string | null;
};

export type LogoChoice = { value: string | null } | { error: string };

/**
 * Decides what to save. A newly uploaded file wins, then "remove", then a link typed in the box. With the box empty
 * an uploaded picture is kept (the box never shows it), while a saved link is cleared.
 */
export function resolveLogo(input: LogoInput): LogoChoice {
  const { file, link, remove, current } = input;

  if (file && file.size > 0) {
    if (file.size > LOGO_MAX_BYTES) {
      return { error: `The logo is larger than ${Math.round(LOGO_MAX_BYTES / 1024)} KB. Use a smaller picture.` };
    }
    const type = sniffImageType(file.bytes);
    if (!type) return { error: "The logo must be a PNG, JPEG or WebP picture." };
    return { value: `data:${type};base64,${Buffer.from(file.bytes).toString("base64")}` };
  }

  if (remove) return { value: null };

  const typed = link?.trim();
  if (typed) return { value: typed };

  return { value: isUploadedLogo(current) ? current : null };
}
