import Link from "next/link";
import { redirect } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { Eye, MessagesSquare, Search } from "lucide-react";
import { auth } from "@/auth";
import { listAllConversations } from "@/lib/chat";
import { formatDateTime } from "@/lib/dates";
import { Badge, EmptyState, PageHeader, SectionCard } from "@/components/ui";

const KIND_LABEL = { DIRECT: "Private", GROUP: "Channel", LEAD: "Lead" } as const;
const KIND_TONE = { DIRECT: "purple", GROUP: "brand", LEAD: "info" } as const;

export default async function AdminChatsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const { q } = await searchParams;
  const conversations = await listAllConversations(q);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Eye}
        title="All chats"
        description="Every team conversation, including private ones. Opening a private conversation is recorded."
      />

      <form method="get" className="flex max-w-xl gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={q ?? ""}
            type="search"
            placeholder="Search by person, lead, channel or a word in a message"
            aria-label="Search conversations"
            className="input pl-9"
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      <SectionCard
        title={q ? `Results for “${q}”` : "Conversations"}
        description={`${conversations.length} with messages, newest first`}
        icon={MessagesSquare}
        bodyClassName="p-0"
      >
        {conversations.length === 0 ? (
          <EmptyState icon={MessagesSquare} title="No conversations found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-slate-50/70 text-left">
                  <th className="px-5 py-3 font-medium text-slate-500">Conversation</th>
                  <th className="px-5 py-3 font-medium text-slate-500">Type</th>
                  <th className="px-5 py-3 font-medium text-slate-500">Messages</th>
                  <th className="px-5 py-3 font-medium text-slate-500">Latest</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {conversations.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3">
                      <Link href={`/chat/${c.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                        {c.title}
                      </Link>
                      <p className="text-xs text-slate-400">{c.detail}</p>
                    </td>
                    <td className="px-5 py-3">
                      <Badge tone={KIND_TONE[c.kind]}>{KIND_LABEL[c.kind]}</Badge>
                    </td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{c.messageCount}</td>
                    <td className="max-w-md px-5 py-3">
                      <p className="truncate text-slate-600">
                        {c.lastMessageAuthor ? `${c.lastMessageAuthor}: ` : ""}
                        {c.lastMessagePreview}
                      </p>
                      <p className="text-xs text-slate-400" title={formatDateTime(c.lastMessageAt)}>
                        {formatDistanceToNowStrict(new Date(c.lastMessageAt), { addSuffix: true })}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
