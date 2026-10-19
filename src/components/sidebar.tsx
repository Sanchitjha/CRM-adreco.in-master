"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import { navGroupsForRole } from "@/lib/nav";
import { BrandLogo } from "@/components/brand-mark";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = navGroupsForRole(role);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-white/10 px-5">
        <Link href="/" onClick={onNavigate}>
          <BrandLogo onDark />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-5">
        {groups.map((group) => (
          <div key={group.title}>
            <div className="nav-section">{group.title}</div>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    data-active={active}
                    className="nav-link"
                  >
                    <Icon className="size-[18px]" strokeWidth={2} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.planned && (
                      <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-300/80">
                        Soon
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-5 py-3.5">
        <p className="text-[11px] leading-relaxed text-slate-500">
          Adreco Engineering Pvt&nbsp;Ltd
          <br />
          Heat-pump lifecycle CRM
        </p>
      </div>
    </div>
  );
}
