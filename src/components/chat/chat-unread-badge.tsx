"use client";

import { cn } from "@/lib/utils";
import { useChatUnread } from "@/components/chat/use-chat-unread";

/** A small count of unread chat messages; renders nothing when there are none. */
export function ChatUnreadBadge({ className }: { className?: string }) {
  const count = useChatUnread();
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} unread chat messages`}
      className={cn(
        "flex min-w-5 items-center justify-center rounded-full bg-heat-500 px-1.5 text-[10px] font-semibold leading-5 text-white",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
