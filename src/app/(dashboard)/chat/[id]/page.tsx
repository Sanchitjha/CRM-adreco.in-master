import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { logActivity } from "@/lib/activity-log";
import { accessTo, describeChannel, listMessages, loadChannel } from "@/lib/chat";
import { ChatConversation } from "@/components/chat/chat-conversation";

export default async function ChatConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) notFound();

  const viewer = { id: session.user.id, role: session.user.role };
  const channel = await loadChannel(id);
  if (!channel) notFound();

  const access = accessTo(viewer, channel);
  if (!access.canRead) notFound();

  const [{ title, subtitle }, messages] = await Promise.all([describeChannel(viewer, channel), listMessages(id)]);

  // An administrator reading a private conversation they are not part of: keep a record of it.
  if (access.oversight) {
    await logActivity({
      userId: viewer.id,
      action: "CHAT_ADMIN_VIEWED",
      entityType: "ChatChannel",
      entityId: id,
      details: { title },
    });
  }

  return (
    <ChatConversation
      key={id}
      channelId={id}
      leadId={channel.leadId ?? undefined}
      title={title}
      subtitle={subtitle}
      viewerId={viewer.id}
      initialMessages={messages}
      canWrite={access.canWrite}
      oversight={access.oversight}
      backHref="/chat"
    />
  );
}
