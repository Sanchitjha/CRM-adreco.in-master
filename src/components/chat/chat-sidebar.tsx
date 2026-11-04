"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { Contact, MessageSquarePlus, Search, Users, X } from "lucide-react";
import { startDirectChat } from "@/app/(dashboard)/chat/actions";
import { Avatar } from "@/components/ui";
import type { ChatChannelSummary, ChatPerson } from "@/lib/chat-types";
import { cn } from "@/lib/utils";

const SECTIONS: { kind: ChatChannelSummary["kind"]; title: string; empty: string }[] = [
  { kind: "GROUP", title: "Channels", empty: "" },
  { kind: "DIRECT", title: "Direct messages", empty: "No direct messages yet. Use New message to start one." },
  { kind: "LEAD", title: "Lead discussions", empty: "" },
];

function ChannelIcon({ channel }: { channel: ChatChannelSummary }) {
  if (channel.kind === "DIRECT") return <Avatar name={channel.title} />;
  const Icon = channel.kind === "GROUP" ? Users : Contact;
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
      <Icon className="size-4" />
    </span>
  );
}

export function ChatSidebar({
  initialChannels,
  people,
}: {
  initialChannels: ChatChannelSummary[];
  people: ChatPerson[];
}) {
  const pathname = usePathname();
  const activeId = pathname.startsWith("/chat/") ? (pathname.split("/")[2] ?? null) : null;

  const [channels, setChannels] = useState(initialChannels);
  const [picking, setPicking] = useState(false);
  const [filter, setFilter] = useState("");

  // Keeps the list fresh: every few seconds while the tab is visible, and straight away when a conversation says
  // something changed.
  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/chat/summary?full=1", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { channels: ChatChannelSummary[] };
        if (!cancelled) setChannels(data.channels);
      } catch {
        // The next poll tries again.
      }
    }

    const timer = setInterval(refresh, 8000);
    const onChanged = () => void refresh();
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    window.addEventListener("chat:changed", onChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("chat:changed", onChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const visiblePeople = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? people.filter((p) => `${p.name} ${p.roleLabel}`.toLowerCase().includes(q)) : people;
  }, [people, filter]);

  return (
    <aside
      aria-label="Conversations"
      className={cn(
        "flex-col border-r border-[var(--border)] bg-slate-50/60 md:flex md:w-80 md:shrink-0",
        activeId ? "hidden" : "flex w-full",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Team chat</h2>
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          aria-expanded={picking}
          className="btn btn-secondary btn-sm"
        >
          {picking ? <X className="size-3.5" /> : <MessageSquarePlus className="size-3.5" />}
          {picking ? "Close" : "New message"}
        </button>
      </div>

      {picking && (
        <div className="border-b border-[var(--border)] bg-white px-3 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              type="search"
              placeholder="Find a colleague…"
              aria-label="Find a colleague"
              className="input pl-8"
            />
          </div>
          <ul className="mt-2 max-h-56 overflow-y-auto">
            {visiblePeople.length === 0 && <li className="px-2 py-2 text-sm text-slate-400">Nobody matches.</li>}
            {visiblePeople.map((person) => (
              <li key={person.id}>
                <form action={startDirectChat}>
                  <input type="hidden" name="userId" value={person.id} />
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-100"
                  >
                    <Avatar name={person.name} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">{person.name}</span>
                      <span className="block truncate text-xs text-slate-400">{person.roleLabel}</span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 overflow-y-auto pb-3">
        {SECTIONS.map((section) => {
          const items = channels.filter((c) => c.kind === section.kind);
          if (items.length === 0 && !section.empty) return null;
          return (
            <div key={section.kind}>
              <div className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {section.title}
              </div>
              {items.length === 0 ? (
                <p className="px-4 py-1 text-sm text-slate-400">{section.empty}</p>
              ) : (
                <ul>
                  {items.map((channel) => (
                    <li key={channel.id}>
                      <Link
                        href={`/chat/${channel.id}`}
                        aria-current={channel.id === activeId ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 px-4 py-2.5 transition hover:bg-white",
                          channel.id === activeId && "bg-white shadow-[inset_3px_0_0_var(--primary)]",
                        )}
                      >
                        <ChannelIcon channel={channel} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-2">
                            <span
                              className={cn(
                                "truncate text-sm text-slate-800",
                                channel.unread > 0 ? "font-semibold" : "font-medium",
                              )}
                            >
                              {channel.title}
                            </span>
                            {channel.lastMessageAt && (
                              <span className="shrink-0 text-[11px] text-slate-400">
                                {formatDistanceToNowStrict(new Date(channel.lastMessageAt))}
                              </span>
                            )}
                          </span>
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-slate-500">
                              {channel.lastMessagePreview
                                ? `${channel.lastMessageAuthor ?? ""}: ${channel.lastMessagePreview}`
                                : (channel.subtitle ?? "No messages yet")}
                            </span>
                            {channel.unread > 0 && (
                              <span className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-heat-500 px-1.5 text-[10px] font-semibold leading-5 text-white">
                                {channel.unread > 99 ? "99+" : channel.unread}
                              </span>
                            )}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
