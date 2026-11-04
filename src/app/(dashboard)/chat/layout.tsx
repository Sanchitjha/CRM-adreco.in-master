import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listChannelsFor, listPeople } from "@/lib/chat";
import { ChatSidebar } from "@/components/chat/chat-sidebar";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const viewer = { id: session.user.id, role: session.user.role };
  const [channels, people] = await Promise.all([listChannelsFor(viewer), listPeople(viewer.id)]);

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[30rem] overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
      <ChatSidebar initialChannels={channels} people={people} />
      <section className="flex min-w-0 flex-1 flex-col">{children}</section>
    </div>
  );
}
