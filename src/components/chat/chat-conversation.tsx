"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowLeft, Eye, SendHorizontal } from "lucide-react";
import { sendChatMessage } from "@/app/(dashboard)/chat/actions";
import type { ChatMessageDto } from "@/lib/chat-types";
import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/chat-text";
import { formatDate, formatTime, toDateInput } from "@/lib/dates";
import { cn } from "@/lib/utils";

const POLL_MS = 3000;
const NEAR_BOTTOM_PX = 96;

/** Adds the messages we do not have yet and keeps them in the order they were sent. */
function mergeMessages(current: ChatMessageDto[], incoming: ChatMessageDto[]): ChatMessageDto[] {
  if (incoming.length === 0) return current;
  const byId = new Map(current.map((m) => [m.id, m]));
  let changed = false;
  for (const message of incoming) {
    if (!byId.has(message.id)) {
      byId.set(message.id, message);
      changed = true;
    }
  }
  if (!changed) return current;
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

type Props = {
  /** Null for a lead's discussion that has no messages yet: its first message creates it. */
  channelId: string | null;
  /** Set for a lead's discussion. */
  leadId?: string;
  title: string;
  subtitle?: string | null;
  viewerId: string;
  initialMessages: ChatMessageDto[];
  canWrite: boolean;
  /** An administrator reading a private conversation they are not part of. */
  oversight?: boolean;
  /** Link back to the conversation list, shown on small screens. */
  backHref?: string;
  /** Drops the header and uses a fixed height, for placing the conversation inside another page. */
  embedded?: boolean;
};

export function ChatConversation({
  channelId: initialChannelId,
  leadId,
  title,
  subtitle,
  viewerId,
  initialMessages,
  canWrite,
  oversight = false,
  backHref,
  embedded = false,
}: Props) {
  const [channelId, setChannelId] = useState(initialChannelId);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const messagesRef = useRef(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Fetches new messages every few seconds while the tab is visible. The first successful fetch also marks the
  // conversation as read, so the badges clear.
  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    let firstPoll = true;

    async function poll() {
      if (document.hidden) return;
      const query = new URLSearchParams({ channelId: channelId as string });
      if (!oversight) query.set("markRead", "1");
      const newest = messagesRef.current[messagesRef.current.length - 1];
      if (newest) query.set("after", newest.createdAt);
      try {
        const res = await fetch(`/api/chat/messages?${query.toString()}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { messages: ChatMessageDto[] };
        if (cancelled) return;
        const known = new Set(messagesRef.current.map((m) => m.id));
        const hasNew = data.messages.some((m) => !known.has(m.id));
        setMessages((current) => mergeMessages(current, data.messages));
        if (!oversight && (firstPoll || hasNew)) window.dispatchEvent(new Event("chat:changed"));
        firstPoll = false;
      } catch {
        // The next poll tries again.
      }
    }

    void poll();
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [channelId, oversight]);

  // Keeps the newest message in view, unless the person has scrolled up to read older ones.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function onScroll() {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }

  function send() {
    const text = draft.trim();
    if (!text || pending || !canWrite) return;
    setError(null);
    startTransition(async () => {
      const target = channelId ? { channelId } : { leadId: leadId ?? "" };
      const result = await sendChatMessage(target, text);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      stickToBottom.current = true;
      setDraft("");
      setChannelId(result.message.channelId);
      setMessages((current) => mergeMessages(current, [result.message]));
      window.dispatchEvent(new Event("chat:changed"));
    });
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter writes a new line. While an input method (Hindi typing, for example) is composing a
    // word, Enter belongs to it.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  }

  const items = messages.flatMap((message, index) => {
    const out: React.ReactNode[] = [];
    const day = toDateInput(new Date(message.createdAt));
    const previousDay = index > 0 ? toDateInput(new Date(messages[index - 1].createdAt)) : null;
    if (day !== previousDay) {
      out.push(
        <li key={`day-${day}`} className="flex justify-center py-2">
          <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[11px] font-medium text-slate-500">
            {formatDate(message.createdAt)}
          </span>
        </li>,
      );
    }
    const mine = message.authorId === viewerId;
    out.push(
      <li key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
        <div
          className={cn(
            "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[75%]",
            mine ? "rounded-br-md bg-brand-600 text-white" : "rounded-bl-md bg-slate-100 text-slate-800",
          )}
        >
          {!mine && (
            <p className="mb-0.5 text-xs font-semibold text-brand-700">
              {message.authorName} <span className="font-normal text-slate-400">· {message.authorRole}</span>
            </p>
          )}
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
          <p className={cn("mt-1 text-right text-[10px]", mine ? "text-white/70" : "text-slate-400")}>
            {formatTime(message.createdAt)}
          </p>
        </div>
      </li>,
    );
    return out;
  });

  return (
    <div className={cn("flex min-h-0 flex-col bg-white", embedded ? "h-[26rem]" : "h-full")}>
      {!embedded && (
        <header className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          {backHref && (
            <Link
              href={backHref}
              aria-label="Back to conversations"
              className="flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"
            >
              <ArrowLeft className="size-4" />
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-slate-900">{title}</h1>
            {subtitle && <p className="truncate text-xs text-slate-400">{subtitle}</p>}
          </div>
        </header>
      )}

      {oversight && (
        <div
          role="status"
          className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800"
        >
          <Eye className="mt-0.5 size-3.5 shrink-0" />
          You are reading this private conversation as an administrator. It is read-only, and your visit is recorded.
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label="Messages"
        className="flex-1 space-y-1.5 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No messages yet. Say hello.</p>
        ) : (
          <ul className="space-y-1.5">{items}</ul>
        )}
      </div>

      {canWrite && (
        <div className="border-t border-[var(--border)] p-3">
          {error && (
            <p className="form-error mb-2" role="alert">
              {error}
            </p>
          )}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              maxLength={MAX_CHAT_MESSAGE_LENGTH}
              placeholder="Write a message…"
              aria-label="Message"
              className="textarea min-h-[2.75rem] flex-1 resize-none"
            />
            <button
              type="button"
              onClick={send}
              disabled={pending || draft.trim().length === 0}
              className="btn btn-primary"
              aria-label="Send message"
            >
              <SendHorizontal className="size-4" />
            </button>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
            <Eye className="size-3 shrink-0" />
            Administrators can read the messages in this conversation. Enter sends, Shift+Enter starts a new line.
          </p>
        </div>
      )}
    </div>
  );
}
