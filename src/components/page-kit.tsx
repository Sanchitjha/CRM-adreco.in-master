import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Badge, SectionCard, EmptyState } from "@/components/ui";
import type { StatusMeta } from "@/lib/statuses";

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
      <ArrowLeft className="size-4" />
      {label}
    </Link>
  );
}

export function StatusPill({ meta, className }: { meta: StatusMeta; className?: string }) {
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
    </Badge>
  );
}

/** Link-based tabs for filtering a list through the query string. */
export function FilterTabs({
  items,
}: {
  items: { label: string; href: string; active: boolean; count?: number }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t) => (
        <Link
          key={t.label}
          href={t.href}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium transition",
            t.active
              ? "border-brand-600 bg-brand-600 text-white"
              : "border-[var(--border-strong)] bg-white text-slate-600 hover:bg-slate-50",
          )}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={cn("text-xs tabular-nums", t.active ? "text-brand-100" : "text-slate-400")}>
              {t.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

/** Label / value pairs in a responsive grid. Blank values render as an em dash. */
export function InfoGrid({
  items,
  columns = 2,
}: {
  items: { label: string; value: React.ReactNode }[];
  columns?: 1 | 2 | 3;
}) {
  const cols = columns === 1 ? "" : columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <dl className={`grid gap-x-6 gap-y-3.5 ${cols}`}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-slate-400">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-slate-800">
            {i.value === null || i.value === undefined || i.value === "" ? "—" : i.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ----------------------------------------------------------------- Data table */

export type Column<T> = {
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "right";
  className?: string;
};

/** The standard list table: header row, striped hover rows, and an empty state. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-slate-50/70 text-left">
              {columns.map((c) => (
                <th
                  key={c.header}
                  className={cn("px-5 py-3 font-medium text-slate-500", c.align === "right" && "text-right")}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={rowKey(row)} className="transition hover:bg-slate-50/70">
                  {columns.map((c) => (
                    <td
                      key={c.header}
                      className={cn("px-5 py-3 text-slate-600", c.align === "right" && "text-right", c.className)}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Activity history */

function describe(action: string, details: unknown): string {
  const base = action.replace(/_/g, " ").toLowerCase();
  const text = base.charAt(0).toUpperCase() + base.slice(1);
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const d = details as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof d.from === "string" && typeof d.to === "string") parts.push(`${d.from} → ${d.to}`);
    if (typeof d.note === "string" && d.note) parts.push(`“${d.note}”`);
    if (parts.length) return `${text} · ${parts.join(" · ")}`;
  }
  return text;
}

/** Who did what to a record, newest first — read from the shared activity log. */
export async function ActivityTimeline({
  entityType,
  entityId,
  title = "History",
}: {
  entityType: string;
  entityId: string;
  title?: string;
}) {
  const logs = await prisma.activityLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { user: { select: { name: true } } },
  });

  return (
    <SectionCard title={title} icon={History} bodyClassName="p-0">
      {logs.length === 0 ? (
        <EmptyState icon={History} title="No activity yet" />
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {logs.map((l) => (
            <li key={l.id} className="px-5 py-3">
              <p className="text-sm text-slate-700">{describe(l.action, l.details)}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                {l.user.name} · {formatDateTime(l.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
