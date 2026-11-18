import type { ReactNode } from "react";
import { Info } from "lucide-react";

/** A short, collapsible explanation at the top of a page, for the people who ask "how does this part work?". */
export function HowItWorks({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-slate-600">
      <summary className="flex cursor-pointer select-none items-center gap-2 font-medium text-slate-800">
        <Info className="size-4 text-brand-600" />
        {title}
      </summary>
      <div className="mt-3 space-y-2 leading-relaxed">{children}</div>
    </details>
  );
}
