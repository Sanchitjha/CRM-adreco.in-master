import { inflateRawSync } from "node:zlib";

/**
 * A small, dependency-free reader for the first sheet of an .xlsx workbook, so a sales team can upload the
 * spreadsheet they already keep. An .xlsx file is a zip of XML parts; this reads the zip's directory, inflates
 * only the handful of parts it needs (never writing anything to disk), and returns the sheet as rows of text.
 *
 * Uploaded files are untrusted, so every size is capped, the XML is read with plain pattern matching (no
 * external entities or DTDs are ever resolved), and malformed input throws instead of being half-read.
 */

const MAX_PART_BYTES = 8 * 1024 * 1024; // each part, after unzipping
const MAX_ENTRIES = 200;
const MAX_ROWS = 5000;
const MAX_COLUMNS = 100;

export type SheetData = { sheetName: string; rows: string[][] };

/** True when the bytes start like a zip archive, which every .xlsx file does. */
export function looksLikeXlsx(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

type ZipEntry = { method: number; compressedSize: number; size: number; offset: number };

function readDirectory(buf: Buffer): Map<string, ZipEntry> {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid zip archive");

  const count = buf.readUInt16LE(eocd + 10);
  const size = buf.readUInt32LE(eocd + 12);
  const start = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES || start + size > buf.length) throw new Error("Unsupported zip archive");

  const entries = new Map<string, ZipEntry>();
  let p = start;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Corrupt zip directory");
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    entries.set(buf.toString("utf8", p + 46, p + 46 + nameLength), {
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      offset: buf.readUInt32LE(p + 42),
    });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readPart(buf: Buffer, entries: Map<string, ZipEntry>, name: string): string | null {
  const entry = entries.get(name);
  if (!entry) return null;
  if (entry.size > MAX_PART_BYTES) throw new Error("A part of the workbook is too large");
  const at = entry.offset;
  if (at + 30 > buf.length || buf.readUInt32LE(at) !== 0x04034b50) throw new Error("Corrupt zip entry");
  const dataStart = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
  const data = buf.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return data.toString("utf8");
  if (entry.method === 8) return inflateRawSync(data, { maxOutputLength: MAX_PART_BYTES }).toString("utf8");
  throw new Error("Unsupported compression in the workbook");
}

function decodeXml(s: string): string {
  const code = (n: number) => {
    try {
      return String.fromCodePoint(n);
    } catch {
      return "";
    }
  };
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => code(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => code(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join("");

// Number formats that show a date. The built-in ids are fixed by the spec; custom formats are checked by their letters.
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function dateStyles(stylesXml: string): boolean[] {
  const custom = new Map(
    [...stylesXml.matchAll(/<numFmt\s+numFmtId="(\d+)"\s+formatCode="([^"]*)"/g)].map((m) => [Number(m[1]), decodeXml(m[2])] as const),
  );
  const isDate = (id: number) => {
    if (BUILTIN_DATE_FORMATS.has(id)) return true;
    const code = custom.get(id);
    return code !== undefined && /[dmyh]/i.test(code.replace(/\[[^\]]*\]|"[^"]*"/g, "")) && !/general/i.test(code);
  };
  const xfs = stylesXml.match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0] ?? "";
  // One entry per cell format, in order: a cell's style number is its position here.
  return [...xfs.matchAll(/<xf\s([^>]*)>/g)].map((m) => isDate(Number(m[1].match(/numFmtId="(\d+)"/)?.[1] ?? 0)));
}

const columnIndex = (ref: string) => ref.replace(/\d+/g, "").split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const isoDate = (serial: number) => new Date(Math.round((Math.floor(serial) - 25569) * 86400 * 1000)).toISOString().slice(0, 10);

/** Reads the first worksheet of an .xlsx file. Dates come back as "YYYY-MM-DD", numbers and text as text. */
export function readXlsx(data: Uint8Array): SheetData {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const entries = readDirectory(buf);

  const workbook = readPart(buf, entries, "xl/workbook.xml");
  const rels = readPart(buf, entries, "xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) throw new Error("This does not look like an Excel workbook");

  const sheet = workbook.match(/<sheet\s[^>]*?name="([^"]*)"[^>]*?r:id="([^"]+)"/);
  if (!sheet) throw new Error("The workbook has no sheets");
  const relationship = [...rels.matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0]).find((tag) => tag.includes(`Id="${sheet[2]}"`));
  const target = relationship?.match(/Target="([^"]+)"/)?.[1];
  if (!target) throw new Error("The first sheet could not be located");
  const sheetXml = readPart(buf, entries, "xl/" + target.replace(/^\/?(xl\/)?/, ""));
  if (!sheetXml) throw new Error("The first sheet could not be read");

  // An empty <si/> still takes up an index, so it must be counted.
  const shared = [...(readPart(buf, entries, "xl/sharedStrings.xml") ?? "").matchAll(/<si(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) =>
    textOf(m[1] ?? ""),
  );
  const dates = dateStyles(readPart(buf, entries, "xl/styles.xml") ?? "");

  const rows: string[][] = [];
  for (const row of sheetXml.matchAll(/<row\s[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    if (rows.length >= MAX_ROWS) break;
    const cells: string[] = [];
    for (const cell of (row[1] ?? "").matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      if (!ref) continue;
      const col = columnIndex(ref);
      if (col < 0 || col >= MAX_COLUMNS) continue;

      const type = attrs.match(/\bt="([^"]+)"/)?.[1] ?? "n";
      const style = Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? 0);
      const inner = cell[2] ?? "";
      const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];

      let value = "";
      if (type === "s" && raw !== undefined) value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = textOf(inner);
      else if (type === "str" && raw !== undefined) value = decodeXml(raw);
      else if (type === "d" && raw !== undefined) value = raw.slice(0, 10);
      else if (type === "b") value = raw === "1" ? "TRUE" : "FALSE";
      else if (type === "n" && raw !== undefined) {
        const n = Number(raw);
        value = dates[style] && Number.isFinite(n) ? isoDate(n) : Number.isFinite(n) ? String(n) : "";
      }
      if (value !== "") {
        while (cells.length < col) cells.push("");
        cells[col] = value;
      }
    }
    if (cells.some((c) => c !== "")) rows.push(cells);
  }

  return { sheetName: decodeXml(sheet[1]), rows };
}
