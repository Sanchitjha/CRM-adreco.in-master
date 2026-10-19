import { Suspense } from "react";
import { Droplets, Wrench, ShieldCheck, Waypoints } from "lucide-react";
import { LoginForm } from "@/components/login-form";
import { BrandLogo } from "@/components/brand-mark";

const HIGHLIGHTS = [
  { icon: Waypoints, title: "One lifecycle", text: "Lead → survey → quotation → order → install → service." },
  { icon: Droplets, title: "Built for heat pumps", text: "Capacities, site loads and technical proposals in one place." },
  { icon: Wrench, title: "Field to office", text: "Site surveys, installations and service jobs stay in sync." },
  { icon: ShieldCheck, title: "Warranty & AMC", text: "Serial-tracked equipment with renewal reminders." },
];

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-[var(--sidebar-bg)] lg:flex lg:flex-col lg:justify-between">
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(120% 80% at 15% 0%, rgba(20,184,166,0.28), transparent 55%), radial-gradient(90% 70% at 100% 100%, rgba(249,115,22,0.18), transparent 55%)",
          }}
        />
        <div className="surface-grid absolute inset-0 opacity-40" />

        <div className="relative p-10">
          <BrandLogo onDark subtitle="Engineering CRM" />
        </div>

        <div className="relative px-10">
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-white">
            The complete customer lifecycle for heat-pump projects.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">
            From the first enquiry to commissioning, warranty and AMC — Adreco CRM keeps sales,
            engineering, installation and service teams working from one record.
          </p>

          <div className="mt-9 grid max-w-lg grid-cols-2 gap-4">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <Icon className="size-5 text-brand-300" />
                <p className="mt-2.5 text-sm font-semibold text-white">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative p-10 text-xs text-slate-500">
          © {new Date().getFullYear()} Adreco Engineering Pvt Ltd
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <BrandLogo subtitle="Engineering CRM" />
          </div>

          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Welcome back. Use the account your administrator created for you.
          </p>

          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>

          <p className="mt-8 text-center text-xs text-slate-400">
            Trouble signing in? Contact your Adreco CRM administrator.
          </p>
        </div>
      </div>
    </div>
  );
}
