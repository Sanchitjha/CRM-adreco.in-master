/** Shapes shared between the chat server code and its screens. Dates travel as ISO strings. */

export type ChatMessageDto = {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  body: string;
  createdAt: string;
};

export type ChatChannelSummary = {
  id: string;
  kind: "DIRECT" | "GROUP" | "LEAD";
  title: string;
  subtitle: string | null;
  leadId: string | null;
  /** Messages from other people since this person last opened the conversation. */
  unread: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageAuthor: string | null;
};

export type ChatPerson = { id: string; name: string; roleLabel: string };

export type SendResult = { ok: true; message: ChatMessageDto } | { ok: false; error: string };
