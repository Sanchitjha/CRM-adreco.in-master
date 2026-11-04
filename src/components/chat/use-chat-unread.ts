"use client";

import { useSyncExternalStore } from "react";

/**
 * The number of unread chat messages, polled from one place however many badges are on screen. It refreshes every
 * twenty seconds while the tab is visible, and straight away when a conversation tells it something changed
 * (the chat screens dispatch a "chat:changed" event after sending or after opening a conversation).
 */
let unread = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function refresh() {
  if (document.hidden) return;
  try {
    const res = await fetch("/api/chat/summary", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { unreadTotal?: number };
    const next = typeof data.unreadTotal === "number" ? data.unreadTotal : 0;
    if (next !== unread) {
      unread = next;
      listeners.forEach((listener) => listener());
    }
  } catch {
    // Offline or restarting: the next poll tries again.
  }
}

function onChanged() {
  void refresh();
}

function onVisible() {
  if (!document.hidden) void refresh();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    void refresh();
    timer = setInterval(refresh, 20_000);
    window.addEventListener("chat:changed", onChanged);
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      window.removeEventListener("chat:changed", onChanged);
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

export function useChatUnread(): number {
  return useSyncExternalStore(
    subscribe,
    () => unread,
    () => 0,
  );
}
