"use client";

import { useSyncExternalStore } from "react";
import { Printer } from "lucide-react";
import { readSheetsPending, subscribeSheets } from "@/lib/sheets-signal";

/**
 * Opens the browser's print dialog, which also offers "Save as PDF". Hidden when the page is printed. On a page with
 * extra sheets (a quotation) it waits until they have all been drawn, because a sheet still being drawn prints blank.
 */
export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  const waiting = useSyncExternalStore(subscribeSheets, readSheetsPending, () => 0);

  return (
    <button type="button" onClick={() => window.print()} disabled={waiting > 0} className="btn btn-primary print:hidden">
      <Printer className="size-4" />
      {waiting > 0 ? "Getting the extra sheets ready…" : label}
    </button>
  );
}
