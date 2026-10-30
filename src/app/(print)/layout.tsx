/** Bare layout for documents meant to be printed or saved as PDF: no navigation, a sheet of paper on screen. */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-100 px-4 py-6 print:bg-white print:p-0">{children}</div>;
}
