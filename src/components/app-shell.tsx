"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Role } from "@prisma/client";
import { signOut } from "next-auth/react";
import { formatDistanceToNow } from "date-fns";
import { Menu, Search, Bell, LogOut, ChevronDown, X, Inbox, KeyRound } from "lucide-react";
import { SidebarNav } from "@/components/sidebar";
import { Avatar } from "@/components/ui";
import { cn, initials } from "@/lib/utils";

export type NotificationItem = {
  id: string;
  message: string;
  createdAt: string;
  read: boolean;
  leadId: string | null;
};

/** Close a popover when clicking outside of it. */
function useClickOutside<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search");
      }}
      className="relative hidden w-full max-w-md sm:block"
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        type="search"
        placeholder="Search customers, quotes, orders, serial numbers…"
        aria-label="Search"
        className="h-9 w-full rounded-lg border border-[var(--border)] bg-slate-50 pl-9 pr-3 text-sm text-slate-700 transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-3 focus:ring-[var(--ring)]"
      />
    </form>
  );
}

function NotificationsMenu({ notifications, unreadCount }: { notifications: NotificationItem[]; unreadCount: number }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <Bell className="size-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-heat-500 px-1 text-[10px] font-semibold leading-4 text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-heat-50 px-2 py-0.5 text-xs font-medium text-heat-600">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <Inbox className="mb-2 size-6 text-slate-300" />
                <p className="text-sm text-slate-400">You&apos;re all caught up.</p>
              </div>
            ) : (
              notifications.map((n) => {
                const body = (
                  <div
                    className={cn(
                      "flex gap-3 px-4 py-3 transition hover:bg-slate-50",
                      !n.read && "bg-brand-50/50",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        n.read ? "bg-slate-300" : "bg-brand-500",
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-slate-700">{n.message}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
                return n.leadId ? (
                  <Link key={n.id} href={`/leads/${n.leadId}`} onClick={() => setOpen(false)} className="block">
                    {body}
                  </Link>
                ) : (
                  <div key={n.id}>{body}</div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ userName, roleLabel }: { userName: string; roleLabel: string }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 transition hover:bg-slate-100"
      >
        <Avatar name={userName} />
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight text-slate-900">{userName}</span>
          <span className="block text-xs leading-tight text-slate-400">{roleLabel}</span>
        </span>
        <ChevronDown className="size-4 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-lg">
          <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {initials(userName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{userName}</p>
              <p className="text-xs text-slate-400">{roleLabel}</p>
            </div>
          </div>
          <Link
            href="/change-password"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
          >
            <KeyRound className="size-4" />
            Change password
          </Link>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 transition hover:bg-slate-50 hover:text-rose-600"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({
  role,
  userName,
  roleLabel,
  notifications,
  unreadCount,
  children,
}: {
  role: Role;
  userName: string;
  roleLabel: string;
  notifications: NotificationItem[];
  unreadCount: number;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      {/* Desktop navigation rail */}
      <aside className="sidebar-shell fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <SidebarNav role={role} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          />
          <aside className="sidebar-shell absolute inset-y-0 left-0 w-72 shadow-2xl">
            <button
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-4 flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" />
            </button>
            <SidebarNav role={role} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Content column */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-[var(--border)] bg-white/85 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <GlobalSearch />

          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/search"
              aria-label="Search"
              className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 sm:hidden"
            >
              <Search className="size-5" />
            </Link>
            <NotificationsMenu notifications={notifications} unreadCount={unreadCount} />
            <div className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
            <UserMenu userName={userName} roleLabel={roleLabel} />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
