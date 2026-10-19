import Link from "next/link";
import { ArrowLeft, Check, Sparkles } from "lucide-react";
import type { ModuleDef } from "@/lib/modules";
import { Badge } from "@/components/ui";

/** Roadmap preview for a module that is designed but not yet built. */
export function ModulePreview({ module }: { module: ModuleDef }) {
  const Icon = module.icon;
  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" />
        Back to dashboard
      </Link>

      {/* Hero */}
      <div className="card relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-90"
          style={{ background: "linear-gradient(120deg, #0b1a24 0%, #0f766e 100%)" }}
        />
        <div className="surface-grid absolute inset-0 opacity-20" />
        <div className="relative p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <Badge tone="brand" className="bg-white/10 text-brand-200 ring-white/20">
              <Sparkles className="size-3" />
              On the roadmap
            </Badge>
            <span className="text-xs font-medium uppercase tracking-wide text-brand-300/70">{module.stage}</span>
          </div>
          <div className="mt-4 flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/20">
              <Icon className="size-6" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">{module.title}</h1>
              <p className="mt-1 text-sm text-brand-100/90">{module.tagline}</p>
            </div>
          </div>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-300">{module.description}</p>
        </div>
      </div>

      {/* Planned capabilities */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Planned capabilities</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {module.features.map((feature) => (
            <div key={feature} className="card flex items-start gap-3 p-4">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <Check className="size-3.5" strokeWidth={2.5} />
              </span>
              <p className="text-sm text-slate-600">{feature}</p>
            </div>
          ))}
        </div>
      </div>

      <p className="rounded-lg border border-dashed border-[var(--border-strong)] bg-slate-50 px-4 py-3 text-sm text-slate-500">
        This module is part of Adreco&apos;s full customer-lifecycle CRM. The design and data model are ready — it
        will light up as the rollout reaches the <span className="font-medium text-slate-700">{module.stage}</span>{" "}
        phase.
      </p>
    </div>
  );
}
