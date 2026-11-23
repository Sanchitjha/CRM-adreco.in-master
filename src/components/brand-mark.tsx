import { cn } from "@/lib/utils";

/** Adreco logomark — renders the official Adreco Heat Pump logo mark. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex size-9 items-center justify-center overflow-hidden rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200/60",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/adreco-logo.png"
        alt="Adreco Heat Pump"
        className="size-full object-contain"
      />
    </span>
  );
}

export function BrandLogo({
  className,
  subtitle = "CRM",
  onDark,
}: {
  className?: string;
  subtitle?: string;
  onDark?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex items-center rounded-lg px-2 py-1 transition",
          onDark ? "bg-white shadow-sm ring-1 ring-black/5" : "bg-transparent",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/adreco-logo.png"
          alt="Adreco Heat Pump"
          className="h-7 w-auto max-w-[140px] object-contain"
        />
      </div>
      {subtitle && (
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            onDark
              ? "bg-white/10 text-white/90 border border-white/15"
              : "bg-slate-100 text-slate-700 border border-slate-200",
          )}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}
