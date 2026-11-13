import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { looksLikeXlsx, readXlsx, readXlsxSheets } from "@/lib/xlsx-lite";

// A tiny zip writer, so the tests can build workbooks of their own instead of shipping a real (customer) file.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files: Record<string, string>): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(text);
    const packed = deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, packed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

const serial = (y: number, m: number, d: number) => (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;

function workbook(sheetXml: string, sharedStrings: string[]): Uint8Array {
  return zip({
    "xl/workbook.xml": '<workbook xmlns:r="x"><sheets><sheet name="Prospects &amp; leads" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/sharedStrings.xml": `<sst>${sharedStrings.map((s) => (s === "" ? "<si/>" : `<si><t>${s}</t></si>`)).join("")}</sst>`,
    "xl/styles.xml": '<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData>${sheetXml}</sheetData></worksheet>`,
  });
}

describe("readXlsxSheets", () => {
  const cellRow = (r: number, text: string) => `<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>${text}</t></is></c></row>`;

  it("reads every visible sheet, one per tab, and skips hidden ones", () => {
    const data = zip({
      "xl/workbook.xml":
        '<workbook xmlns:r="x"><sheets><sheet name="Sept" sheetId="1" r:id="rId1"/><sheet name="Oct" sheetId="2" r:id="rId2"/><sheet name="Notes" sheetId="3" state="hidden" r:id="rId3"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels":
        '<Relationships><Relationship Id="rId1" Type="t" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="t" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="t" Target="worksheets/sheet3.xml"/></Relationships>',
      "xl/styles.xml": '<styleSheet><cellXfs count="1"><xf numFmtId="0"/></cellXfs></styleSheet>',
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData>${cellRow(1, "Name")}${cellRow(2, "Asha")}</sheetData></worksheet>`,
      "xl/worksheets/sheet2.xml": `<worksheet><sheetData>${cellRow(1, "Name")}${cellRow(2, "Ravi")}</sheetData></worksheet>`,
      "xl/worksheets/sheet3.xml": `<worksheet><sheetData>${cellRow(1, "Secret")}</sheetData></worksheet>`,
    });

    const sheets = readXlsxSheets(data);
    expect(sheets.map((s) => s.sheetName)).toEqual(["Sept", "Oct"]);
    expect(sheets[0].rows).toEqual([["Name"], ["Asha"]]);
    expect(sheets[1].rows).toEqual([["Name"], ["Ravi"]]);
    expect(readXlsx(data).sheetName).toBe("Sept");
  });
});

describe("readXlsx", () => {
  it("reads text, numbers and dates from the first sheet", () => {
    const sheet = [
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>',
      `<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>9876543210</v></c><c r="C2" s="1"><v>${serial(2026, 11, 18)}</v></c></row>`,
    ].join("");
    const out = readXlsx(workbook(sheet, ["Name", "Phone", "Follow-up", "Hotel &amp; Spa"]));
    expect(out.sheetName).toBe("Prospects & leads");
    expect(out.rows).toEqual([
      ["Name", "Phone", "Follow-up"],
      ["Hotel & Spa", "9876543210", "2026-11-18"],
    ]);
  });

  it("pads gaps, skips blank rows and reads inline strings and booleans", () => {
    const sheet = [
      '<row r="1"><c r="A1" t="inlineStr"><is><t>first</t></is></c><c r="C1" t="b"><v>1</v></c></row>',
      '<row r="2"><c r="A2"/></row>',
      '<row r="3"><c r="B3" t="str"><v>formula text</v></c></row>',
    ].join("");
    expect(readXlsx(workbook(sheet, [])).rows).toEqual([
      ["first", "", "TRUE"],
      ["", "formula text"],
    ]);
  });

  it("keeps later shared strings in place after an empty one", () => {
    const sheet = '<row r="1"><c r="A1" t="s"><v>1</v></c><c r="B1" t="s"><v>2</v></c></row>';
    expect(readXlsx(workbook(sheet, ["a", "", "c"])).rows).toEqual([["", "c"]]);
  });

  it("rejects data that is not a workbook", () => {
    expect(() => readXlsx(new TextEncoder().encode("name,phone\nRaj,9876543210"))).toThrow();
    expect(() => readXlsx(zip({ "hello.txt": "hi" }))).toThrow(/Excel workbook/);
  });
});

describe("looksLikeXlsx", () => {
  it("tells a workbook from a text file", () => {
    expect(looksLikeXlsx(workbook("", []))).toBe(true);
    expect(looksLikeXlsx(new TextEncoder().encode("name,phone"))).toBe(false);
  });
});
