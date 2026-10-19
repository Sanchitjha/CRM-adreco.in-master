import { cn } from "@/lib/utils";

/** Adreco logomark — a thermal tile: warm-to-cool gradient with an airflow swirl. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex size-9 items-center justify-center overflow-hidden rounded-xl shadow-sm",
        className,
      )}
    >
      <svg viewBox="0 0 40 40" className="size-full" role="img" aria-label="Adreco">
        <defs>
          <linearGradient id="adreco-mark" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="55%" stopColor="#0d9488" />
            <stop offset="100%" stopColor="#0f766e" />
          </linearGradient>
        </defs>
        <rect width="40" height="40" rx="11" fill="url(#adreco-mark)" />
        {/* airflow / heat-exchange swirls */}
        <path
          d="M11 15c4-3 9-3 13 0 3.2 2.4 3 6.4-.4 7.6-2.4.9-4.6-.4-4.6-2.6 0-1.6 1.2-2.6 2.7-2.3"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        />
        <path
          d="M27 27c-4 2.6-9 2.6-13 0"
          fill="none"
          stroke="#d5fff8"
          strokeWidth="2.4"
          strokeLinecap="round"
          opacity="0.8"
        />
      </svg>
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
      <BrandMark />
      <div className="leading-tight">
        <div className={cn("text-[15px] font-semibold tracking-tight", onDark ? "text-white" : "text-slate-900")}>
          Adreco
        </div>
        <div className={cn("text-[11px] font-medium", onDark ? "text-brand-300/80" : "text-slate-400")}>
          {subtitle}
        </div>
      </div>
    </div>
  );
}
