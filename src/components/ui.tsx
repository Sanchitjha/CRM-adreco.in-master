import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn, initials } from "@/lib/utils";

/* ---------------------------------------------------------------- Page header */

export function PageHeader({
  title,
  description,
  eyebrow,
  icon: Icon,
  actions,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3.5">
        {Icon && (
          <span className="mt-0.5 hidden size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100 sm:flex">
            <Icon className="size-5.5" strokeWidth={2} />
          </span>
        )}
        <div>
          {eyebrow && (
            <div className="text-xs font-semibold uppercase tracking-wide text-brand-600">{eyebrow}</div>
          )}
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------- Cards */

export function Card({
  children,
  className,
  interactive,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return <div className={cn("card", interactive && "card-interactive", className)}>{children}</div>;
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("card overflow-hidden", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          {Icon && <Icon className="size-4 text-slate-400" strokeWidth={2} />}
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {description && <p className="text-xs text-slate-500">{description}</p>}
          </div>
        </div>
        {action}
      </header>
      <div className={cn("px-5 py-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ----------------------------------------------------------------- Stat card */

const STAT_ACCENTS = {
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  heat: "bg-heat-50 text-heat-600 ring-heat-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  amber: "bg-amber-50 text-amber-600 ring-amber-100",
  rose: "bg-rose-50 text-rose-600 ring-rose-100",
  violet: "bg-violet-50 text-violet-600 ring-violet-100",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = "brand",
  hint,
  href,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  accent?: keyof typeof STAT_ACCENTS;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        {Icon && (
          <span className={cn("flex size-8 items-center justify-center rounded-lg ring-1", STAT_ACCENTS[accent])}>
            <Icon className="size-4" strokeWidth={2} />
          </span>
        )}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="card card-interactive block p-4">
        {inner}
      </Link>
    );
  }
  return <div className="card p-4">{inner}</div>;
}

/* --------------------------------------------------------------------- Badge */

const BADGE_TONES = {
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
} as const;

export type BadgeTone = keyof typeof BADGE_TONES;

export function Badge({
  children,
  tone = "neutral",
  className,
  dot,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        BADGE_TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- Empty state */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
      {Icon && (
        <span className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Icon className="size-6" strokeWidth={1.75} />
        </span>
      )}
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------- Avatar */

const AVATAR_PALETTE = [
  "bg-brand-100 text-brand-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-rose-100 text-rose-700",
];

export function Avatar({ name, className }: { name: string; className?: string }) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const color = AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        color,
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
