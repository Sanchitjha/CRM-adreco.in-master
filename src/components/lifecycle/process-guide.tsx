import Link from "next/link";
import { BookOpen } from "lucide-react";

export type GuideStep = {
  title: string;
  body: React.ReactNode;
  /** A screen the step happens on, so the person can go straight there. */
  link?: { href: string; label: string };
};

/**
 * A short "how does this work here" panel for a module whose steps are spread over several screens (warranty, AMC). It
 * is a plain details element, so it opens and closes without scripts and is open when the page loads.
 */
export function ProcessGuide({ title, intro, steps }: { title: string; intro: string; steps: GuideStep[] }) {
  return (
    <details open className="card group overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 border-b border-[var(--border)] px-5 py-3.5 group-[:not([open])]:border-b-0">
        <BookOpen className="size-4 text-brand-600" strokeWidth={2} />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{intro}</p>
        </div>
        <span className="text-xs font-medium text-slate-400 group-open:hidden">Show</span>
        <span className="hidden text-xs font-medium text-slate-400 group-open:inline">Hide</span>
      </summary>
      <ol className="grid gap-x-8 gap-y-4 px-5 py-4 md:grid-cols-2">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
              {index + 1}
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-medium text-slate-900">{step.title}</p>
              <p className="mt-0.5 text-slate-600">{step.body}</p>
              {step.link && (
                <Link href={step.link.href} className="mt-1 inline-block text-xs font-medium text-brand-600 hover:text-brand-700">
                  {step.link.label} →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
