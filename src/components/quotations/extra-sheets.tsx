"use client";

import { useEffect, useState } from "react";
import { FileStack, TriangleAlert } from "lucide-react";
import type { SheetKind } from "@/lib/attachments";
import { announceSheets as announce } from "@/lib/sheets-signal";

/** One extra sheet of a quotation, with a link that works for the next hour (made on the server). */
export type PrintSheet = { id: string; name: string; kind: SheetKind; url: string };

type SheetPage = { src: string; width: number; height: number };
type SheetState = { status: "loading" | "ready" | "error"; pages: SheetPage[]; note?: string };

/** The long side of a PDF page as drawn, in pixels: sharp on paper (about 190 dpi on A4) without filling the memory. */
const RENDER_LONG_SIDE = 2200;
/** More pages than this is not an extra sheet but a book; the rest is left out and the person is told. */
const MAX_PDF_PAGES = 30;

function loadPicture(url: string): Promise<SheetPage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ src: url, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("The picture could not be loaded."));
    img.src = url;
  });
}

/** Draws every page of a PDF to a picture, so that the browser prints it as part of the page. */
async function drawPdf(url: string, made: string[]): Promise<{ pages: SheetPage[]; note?: string }> {
  // The reader is large, so it is fetched only when a quotation really has a PDF sheet.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

  const response = await fetch(url);
  if (!response.ok) throw new Error("The file could not be fetched from storage.");
  const data = new Uint8Array(await response.arrayBuffer());

  const loading = pdfjs.getDocument({ data });
  const doc = await loading.promise;
  try {
    const count = Math.min(doc.numPages, MAX_PDF_PAGES);
    const pages: SheetPage[] = [];
    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: RENDER_LONG_SIDE / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport, intent: "print", background: "#ffffff" }).promise;
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.9));
      if (!blob) throw new Error("A page of the PDF could not be drawn.");
      const src = URL.createObjectURL(blob);
      made.push(src);
      pages.push({ src, width: canvas.width, height: canvas.height });
      canvas.width = 0; // lets go of the big drawing at once
      page.cleanup();
    }
    return {
      pages,
      note: doc.numPages > count ? `Only the first ${count} of ${doc.numPages} pages of this PDF are printed.` : undefined,
    };
  } finally {
    void loading.destroy();
  }
}

/**
 * The extra sheets of a quotation, put on the page after the quotation: each picture, and each page of each PDF, on a
 * page of its own, so that "Print / Save as PDF" gives one document with everything in it. On screen it is a preview
 * with a switch to leave the sheets out of the printout.
 */
export function ExtraSheets({ sheets }: { sheets: PrintSheet[] }) {
  const [state, setState] = useState<Record<string, SheetState>>({});
  const [include, setInclude] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const made: string[] = [];
    announce(sheets.length);

    async function run() {
      let pending = sheets.length;
      for (const sheet of sheets) {
        let result: SheetState;
        try {
          const drawn = sheet.kind === "pdf" ? await drawPdf(sheet.url, made) : { pages: [await loadPicture(sheet.url)] };
          result = { status: "ready", pages: drawn.pages, note: "note" in drawn ? drawn.note : undefined };
        } catch (error) {
          result = { status: "error", pages: [], note: error instanceof Error ? error.message : "This sheet could not be read." };
        }
        if (cancelled) return;
        pending -= 1;
        setState((prev) => ({ ...prev, [sheet.id]: result }));
        announce(pending);
      }
    }
    void run();

    return () => {
      cancelled = true;
      announce(0);
      made.forEach((src) => URL.revokeObjectURL(src));
    };
  }, [sheets]);

  if (sheets.length === 0) return null;

  const pending = sheets.filter((s) => (state[s.id]?.status ?? "loading") === "loading").length;
  const failed = sheets.filter((s) => state[s.id]?.status === "error");

  return (
    <section className="mt-6 space-y-4 print:mt-0" aria-label="Extra sheets">
      <div className="rounded-lg border border-[var(--border)] bg-white p-4 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <FileStack className="size-4 text-slate-400" />
            Extra sheets ({sheets.length}), printed after the quotation
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} className="size-4" />
            Include them when printing
          </label>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {pending > 0
            ? `Getting the sheets ready (${sheets.length - pending} of ${sheets.length})… Printing is possible once they are all here.`
            : failed.length > 0
              ? "Some sheets could not be shown and will not print:"
              : "All sheets are ready. Add or remove sheets on the quotation page, then reload this page."}
        </p>
        {failed.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-rose-700" role="alert">
            {failed.map((s) => (
              <li key={s.id} className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  {s.name}: {state[s.id]?.note} Open it on the quotation page to check the file.
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={include ? "" : "print:hidden"}>
        {sheets.map((sheet) => {
          const s = state[sheet.id];
          return (
            <div key={sheet.id} className="space-y-4">
              {s?.note && s.status === "ready" && <p className="text-xs text-amber-700 print:hidden">{sheet.name}: {s.note}</p>}
              {s?.status === "ready" &&
                s.pages.map((page, index) => (
                  <figure
                    key={page.src + index}
                    className={`break-before-page rounded-lg border border-[var(--border)] bg-white p-3 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none ${include ? "" : "opacity-40"}`}
                  >
                    <figcaption className="mb-2 text-xs text-slate-400 print:hidden">
                      {sheet.name}
                      {s.pages.length > 1 ? `, page ${index + 1} of ${s.pages.length}` : ""}
                    </figcaption>
                    {/* A drawn page or a short-lived signed address, so the plain element is the right one here. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={page.src}
                      alt={`${sheet.name}, page ${index + 1}`}
                      width={page.width}
                      height={page.height}
                      className="mx-auto block h-auto max-h-[255mm] w-auto max-w-full object-contain"
                    />
                  </figure>
                ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
