/**
 * How the extra sheets of a quotation tell the print button that they are still being drawn (see ExtraSheets): nothing
 * is printed from a page that is only half there, because a sheet that is still being drawn would come out blank.
 * It is a window event plus the latest number kept on window, so that a button that appears later still knows.
 */
export const SHEETS_EVENT = "extra-sheets-status";
const KEY = "__extraSheetsPending";

export function announceSheets(pending: number): void {
  (window as unknown as Record<string, number>)[KEY] = pending;
  window.dispatchEvent(new Event(SHEETS_EVENT));
}

/** How many sheets are still being drawn (0 when the page has none). */
export function readSheetsPending(): number {
  const n = (window as unknown as Record<string, unknown>)[KEY];
  return typeof n === "number" ? n : 0;
}

export function subscribeSheets(callback: () => void): () => void {
  window.addEventListener(SHEETS_EVENT, callback);
  return () => window.removeEventListener(SHEETS_EVENT, callback);
}
