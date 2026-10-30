"use client";

import { Printer } from "lucide-react";

/** Opens the browser's print dialog, which also offers "Save as PDF". Hidden when the page is printed. */
export function PrintButton({ label = "Print / Save as PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn btn-primary print:hidden">
      <Printer className="size-4" />
      {label}
    </button>
  );
}
