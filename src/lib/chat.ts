import { Prisma, type Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/rbac";
import {
  GROUP_ALL_KEY,
  canOpenLead,
  channelAccess,
  directChannelKey,
  directParticipants,
  groupRoleKey,
  leadChannelKey,
  type ChannelAccess,
  type ChatLeadInfo,
  type ChatViewer,
} from "@/lib/chat-access";
import { CHAT_MESSAGES_PER_MINUTE, chatPreview, cleanChatBody } from "@/lib/chat-text";
import type { ChatChannelSummary, ChatMessageDto, ChatPerson, SendResult } from "@/lib/chat-types";

/** Roles that get a group of their own. Admins belong to every group. */
const GROUP_ROLES: Role[] = ["SALES", "DESIGN", "ACCOUNTS", "INSTALLATION", "SERVICE"];

const channelInclude = {
  lead: {
    select: {
      id: true,
      customerName: true,
      assignedToId: true,
      currentDepartment: { select: { name: true } },
    },
  },
} satisfies Prisma.ChatChannelInclude;

export type ChannelRow = Prisma.ChatChannelGetPayload<{ include: typeof channelInclude }>;

const messageInclude = { author: { select: { name: true, role: true } } } satisfies Prisma.ChatMessageInclude;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function leadInfoOf(row: ChannelRow): ChatLeadInfo | null {
  if (!row.lead) return null;
  return { assignedToId: row.lead.assignedToId, currentDepartmentName: row.lead.currentDepartment?.name ?? null };
}

function toMessageDto(m: Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>): ChatMessageDto {
  return {
    id: m.id,
    channelId: m.channelId,
    authorId: m.authorId,
    authorName: m.author.name,
    authorRole: ROLE_LABELS[m.author.role],
    body: m.body,
    createdAt: m.createdAt.toISOString(),
  };
}

/* ------------------------------------------------------------------ finding conversations */

let groupsEnsured = false;

/** Makes sure the "Everyone" group and one group per role exist. Cheap after the first call in each process. */
export async function ensureGroupChannels(): Promise<void> {
  if (groupsEnsured) return;
  const wanted = [
    { key: GROUP_ALL_KEY, name: "Everyone", audienceRole: null as Role | null },
    ...GROUP_ROLES.map((role) => ({ key: groupRoleKey(role), name: ROLE_LABELS[role], audienceRole: role as Role | null })),
  ];
  for (const group of wanted) {
    try {
      await prisma.chatChannel.upsert({
        where: { key: group.key },
        create: { kind: "GROUP", key: group.key, name: group.name, audienceRole: group.audienceRole },
        update: {},
      });
    } catch (error) {
      // Another server created it a moment ago: that is what we wanted anyway.
      if (!isUniqueViolation(error)) throw error;
    }
  }
  groupsEnsured = true;
}

export async function loadChannel(channelId: string): Promise<ChannelRow | null> {
  return prisma.chatChannel.findUnique({ where: { id: channelId }, include: channelInclude });
}

export function accessTo(viewer: ChatViewer, row: ChannelRow): ChannelAccess {
  return channelAccess(viewer, row, leadInfoOf(row));
}

/** Finds, or starts, the private conversation between the viewer and one other active person. */
export async function openDirectChannel(viewerId: string, otherId: string): Promise<string | null> {
  if (viewerId === otherId) return null;
  const other = await prisma.user.findFirst({ where: { id: otherId, active: true }, select: { id: true } });
  if (!other) return null;
  const key = directChannelKey(viewerId, otherId);
  try {
    const channel = await prisma.chatChannel.upsert({
      where: { key },
      create: { kind: "DIRECT", key },
      update: {},
      select: { id: true },
    });
    return channel.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const existing = await prisma.chatChannel.findUnique({ where: { key }, select: { id: true } });
    return existing?.id ?? null;
  }
}

/**
 * Finds, or starts, the discussion of a lead. Returns null when the lead does not exist or the viewer may not open
 * it, so a conversation is never created for someone who has no business in it.
 */
export async function openLeadChannel(viewer: ChatViewer, leadId: string): Promise<ChannelRow | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, assignedToId: true, currentDepartment: { select: { name: true } } },
  });
  if (!lead) return null;
  if (!canOpenLead(viewer, { assignedToId: lead.assignedToId, currentDepartmentName: lead.currentDepartment?.name ?? null })) {
    return null;
  }
  const key = leadChannelKey(leadId);
  try {
    await prisma.chatChannel.upsert({ where: { key }, create: { kind: "LEAD", key, leadId }, update: {} });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  return prisma.chatChannel.findUnique({ where: { key }, include: channelInclude });
}

/** What to call a conversation, and a line underneath it, from the viewer's point of view. */
export async function describeChannel(
  viewer: ChatViewer,
  row: ChannelRow,
): Promise<{ title: string; subtitle: string | null }> {
  if (row.kind === "GROUP") {
    return {
      title: row.name ?? "Group",
      subtitle: row.audienceRole ? `The ${ROLE_LABELS[row.audienceRole]} team` : "Everyone in the company",
    };
  }
  if (row.kind === "LEAD") {
    return { title: row.lead?.customerName ?? "Lead", subtitle: "Discussion about this lead" };
  }
  const people = directParticipants(row.key);
  if (!people) return { title: "Conversation", subtitle: null };
  const users = await prisma.user.findMany({
    where: { id: { in: people } },
    select: { id: true, name: true, role: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  if (people.includes(viewer.id)) {
    const other = byId.get(people.find((id) => id !== viewer.id) ?? "");
    return { title: other?.name ?? "Unknown person", subtitle: other ? ROLE_LABELS[other.role] : null };
  }
  const [first, second] = people.map((id) => byId.get(id)?.name ?? "Unknown person");
  return { title: `${first} and ${second}`, subtitle: "Private conversation between two people" };
}

/** Active colleagues the viewer can start a conversation with. */
export async function listPeople(viewerId: string): Promise<ChatPerson[]> {
  const users = await prisma.user.findMany({
    where: { active: true, id: { not: viewerId } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ id: u.id, name: u.name, roleLabel: ROLE_LABELS[u.role] }));
}

/* ------------------------------------------------------------------ the conversation list and unread counts */

type Selection = {
  rows: ChannelRow[];
  /** Conversations whose unread messages count towards the badge. */
  counted: Set<string>;
  /** Where unread counting starts for conversations the person has never opened. */
  joinedAt: Date;
};

/**
 * The conversations to show a person. Groups follow their audience, direct conversations are the person's own, and
 * a lead thread appears once it has messages and the person owns the lead or has taken part. Admins see every group
 * and every lead thread that has messages.
 */
async function selectChannels(viewer: ChatViewer): Promise<Selection> {
  await ensureGroupChannels();
  const isAdmin = viewer.role === "ADMIN";

  const [reads, user] = await Promise.all([
    prisma.chatRead.findMany({ where: { userId: viewer.id }, select: { channelId: true } }),
    prisma.user.findUnique({ where: { id: viewer.id }, select: { createdAt: true } }),
  ]);
  const joined = new Set(reads.map((r) => r.channelId));

  const rows = await prisma.chatChannel.findMany({
    where: {
      OR: [
        isAdmin
          ? { kind: "GROUP" }
          : { kind: "GROUP", OR: [{ audienceRole: null }, { audienceRole: viewer.role }] },
        {
          kind: "DIRECT",
          messages: { some: {} },
          OR: [{ key: { startsWith: `dm:${viewer.id}:` } }, { key: { endsWith: `:${viewer.id}` } }],
        },
        {
          kind: "LEAD",
          messages: { some: {} },
          ...(isAdmin
            ? {}
            : { OR: [{ reads: { some: { userId: viewer.id } } }, { lead: { assignedToId: viewer.id } }] }),
        },
      ],
    },
    include: channelInclude,
    orderBy: { lastMessageAt: "desc" },
    take: 150,
  });

  const visible = rows.filter((row) => accessTo(viewer, row).canRead);

  const counted = new Set<string>();
  for (const row of visible) {
    if (row.kind === "DIRECT") counted.add(row.id);
    else if (row.kind === "GROUP") {
      if (joined.has(row.id) || row.audienceRole === null || row.audienceRole === viewer.role) counted.add(row.id);
    } else if (joined.has(row.id) || row.lead?.assignedToId === viewer.id) counted.add(row.id);
  }

  return { rows: visible, counted, joinedAt: user?.createdAt ?? new Date(0) };
}

async function unreadByChannel(viewerId: string, channelIds: string[], joinedAt: Date): Promise<Map<string, number>> {
  if (channelIds.length === 0) return new Map();
  // The timestamp columns hold UTC wall-clock time. The cut-off is passed as text and cast to a plain timestamp, so
  // it is read the same way whatever time zone the database server runs in (a timestamptz parameter would be
  // converted into the server's zone and shift every comparison).
  const found = await prisma.$queryRaw<{ channelId: string; unread: number }[]>(Prisma.sql`
    SELECT m."channelId" AS "channelId", COUNT(*)::int AS "unread"
    FROM "ChatMessage" m
    LEFT JOIN "ChatRead" r ON r."channelId" = m."channelId" AND r."userId" = ${viewerId}
    WHERE m."channelId" IN (${Prisma.join(channelIds)})
      AND m."authorId" <> ${viewerId}
      AND m."createdAt" > COALESCE(r."lastReadAt", CAST(${joinedAt.toISOString()} AS timestamp))
    GROUP BY m."channelId"
  `);
  return new Map(found.map((r) => [r.channelId, r.unread]));
}

async function lastMessages(
  channelIds: string[],
): Promise<Map<string, { body: string; authorName: string; createdAt: Date }>> {
  if (channelIds.length === 0) return new Map();
  const found = await prisma.$queryRaw<{ channelId: string; body: string; createdAt: Date; authorName: string }[]>(
    Prisma.sql`
      SELECT DISTINCT ON (m."channelId") m."channelId" AS "channelId", m."body" AS "body",
             m."createdAt" AS "createdAt", u."name" AS "authorName"
      FROM "ChatMessage" m
      JOIN "User" u ON u."id" = m."authorId"
      WHERE m."channelId" IN (${Prisma.join(channelIds)})
      ORDER BY m."channelId", m."createdAt" DESC
    `,
  );
  return new Map(found.map((r) => [r.channelId, r]));
}

/** Names of the people on the other end of the viewer's direct conversations, keyed by conversation. */
async function directTitles(viewerId: string, rows: ChannelRow[]): Promise<Map<string, { name: string; role: Role } | null>> {
  const otherByChannel = new Map<string, string>();
  for (const row of rows) {
    if (row.kind !== "DIRECT") continue;
    const people = directParticipants(row.key);
    const other = people?.find((id) => id !== viewerId);
    if (other) otherByChannel.set(row.id, other);
  }
  const ids = [...new Set(otherByChannel.values())];
  const users = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, role: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return new Map([...otherByChannel].map(([channelId, userId]) => [channelId, byId.get(userId) ?? null]));
}

export async function listChannelsFor(viewer: ChatViewer): Promise<ChatChannelSummary[]> {
  const { rows, counted, joinedAt } = await selectChannels(viewer);
  if (rows.length === 0) return [];

  const [unread, last, titles] = await Promise.all([
    unreadByChannel(viewer.id, [...counted], joinedAt),
    lastMessages(rows.map((r) => r.id)),
    directTitles(viewer.id, rows),
  ]);

  return rows.map((row): ChatChannelSummary => {
    const lastMessage = last.get(row.id);
    let title: string;
    let subtitle: string | null = null;
    if (row.kind === "GROUP") {
      title = row.name ?? "Group";
    } else if (row.kind === "LEAD") {
      title = row.lead?.customerName ?? "Lead";
      subtitle = "Lead discussion";
    } else {
      const other = titles.get(row.id);
      title = other?.name ?? "Unknown person";
      subtitle = other ? ROLE_LABELS[other.role] : null;
    }
    return {
      id: row.id,
      kind: row.kind,
      title,
      subtitle,
      leadId: row.leadId,
      unread: unread.get(row.id) ?? 0,
      lastMessageAt: lastMessage ? lastMessage.createdAt.toISOString() : null,
      lastMessagePreview: lastMessage ? chatPreview(lastMessage.body) : null,
      lastMessageAuthor: lastMessage ? lastMessage.authorName : null,
    };
  });
}

/** Unread messages across every conversation that counts for this person: the number on the menu badge. */
export async function totalUnread(viewer: ChatViewer): Promise<number> {
  const { counted, joinedAt } = await selectChannels(viewer);
  const unread = await unreadByChannel(viewer.id, [...counted], joinedAt);
  let total = 0;
  for (const n of unread.values()) total += n;
  return total;
}

/* ------------------------------------------------------------------ reading and writing messages */

/**
 * The newest messages of a conversation, oldest first. With `after`, only messages from that moment on (the
 * caller drops the ones it already has), which is what the screen asks for every few seconds.
 */
export async function listMessages(channelId: string, options: { after?: Date; limit?: number } = {}): Promise<ChatMessageDto[]> {
  const { after, limit = 100 } = options;
  if (after) {
    const rows = await prisma.chatMessage.findMany({
      where: { channelId, createdAt: { gte: after } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 200,
      include: messageInclude,
    });
    return rows.map(toMessageDto);
  }
  const rows = await prisma.chatMessage.findMany({
    where: { channelId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
    include: messageInclude,
  });
  return rows.reverse().map(toMessageDto);
}

/** Records that a person has seen a conversation up to a moment. It only ever moves forward. */
export async function markChannelRead(userId: string, channelId: string, upTo: Date): Promise<void> {
  // Typed queries rather than one raw statement: a raw timestamp parameter is converted into the database server's
  // time zone, while every other date in the app is stored as UTC.
  const advance = () =>
    prisma.chatRead.updateMany({ where: { channelId, userId, lastReadAt: { lt: upTo } }, data: { lastReadAt: upTo } });

  const moved = await advance();
  if (moved.count > 0) return;
  try {
    await prisma.chatRead.create({ data: { channelId, userId, lastReadAt: upTo } });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Created a moment ago by another request: make sure it is at least as far along as this one.
    await advance();
  }
}

/** Posts a message to an existing conversation, or to a lead's discussion (started on its first message). */
export async function postMessage(
  viewer: ChatViewer,
  target: { channelId: string } | { leadId: string },
  rawBody: unknown,
): Promise<SendResult> {
  const cleaned = cleanChatBody(rawBody);
  if (!cleaned.ok) return { ok: false, error: cleaned.error };

  const row = "leadId" in target ? await openLeadChannel(viewer, target.leadId) : await loadChannel(target.channelId);
  if (!row) return { ok: false, error: "That conversation is not available." };
  if (!accessTo(viewer, row).canWrite) return { ok: false, error: "You cannot post in this conversation." };

  const recent = await prisma.chatMessage.count({
    where: { authorId: viewer.id, createdAt: { gt: new Date(Date.now() - 60_000) } },
  });
  if (recent >= CHAT_MESSAGES_PER_MINUTE) {
    return { ok: false, error: "You are sending messages very quickly. Please wait a moment." };
  }

  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.chatMessage.create({
      data: { channelId: row.id, authorId: viewer.id, body: cleaned.body },
      include: messageInclude,
    });
    await tx.chatChannel.update({ where: { id: row.id }, data: { lastMessageAt: created.createdAt } });
    return created;
  });
  await markChannelRead(viewer.id, row.id, message.createdAt);

  return { ok: true, message: toMessageDto(message) };
}

/* ------------------------------------------------------------------ the administrator's view */

export type ConversationOverview = {
  id: string;
  kind: "DIRECT" | "GROUP" | "LEAD";
  title: string;
  /** Who is in it: the two people, the audience, or the lead's owner. */
  detail: string;
  messageCount: number;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastMessageAuthor: string | null;
};

/** Every conversation that has messages, newest first, optionally narrowed by a name or a word in a message. */
export async function listAllConversations(search?: string): Promise<ConversationOverview[]> {
  const q = search?.trim();

  let matchingUserIds: string[] = [];
  if (q) {
    const users = await prisma.user.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { id: true },
      take: 20,
    });
    matchingUserIds = users.map((u) => u.id);
  }

  const rows = await prisma.chatChannel.findMany({
    where: {
      messages: { some: {} },
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { lead: { customerName: { contains: q, mode: "insensitive" } } },
              { messages: { some: { body: { contains: q, mode: "insensitive" } } } },
              ...matchingUserIds.map((id) => ({ key: { contains: id } })),
            ],
          }
        : {}),
    },
    include: { ...channelInclude, _count: { select: { messages: true } } },
    orderBy: { lastMessageAt: "desc" },
    take: 300,
  });
  if (rows.length === 0) return [];

  const userIds = new Set<string>();
  for (const row of rows) {
    if (row.kind !== "DIRECT") continue;
    for (const id of directParticipants(row.key) ?? []) userIds.add(id);
  }
  const [users, last] = await Promise.all([
    userIds.size
      ? prisma.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    lastMessages(rows.map((r) => r.id)),
  ]);
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  return rows.map((row): ConversationOverview => {
    const lastMessage = last.get(row.id);
    let title: string;
    let detail: string;
    if (row.kind === "DIRECT") {
      const people = (directParticipants(row.key) ?? []).map((id) => nameOf.get(id) ?? "Unknown person");
      title = people.join(" and ");
      detail = "Private conversation";
    } else if (row.kind === "GROUP") {
      title = row.name ?? "Group";
      detail = row.audienceRole ? `The ${ROLE_LABELS[row.audienceRole]} team` : "Everyone in the company";
    } else {
      title = row.lead?.customerName ?? "Lead";
      detail = "Lead discussion";
    }
    return {
      id: row.id,
      kind: row.kind,
      title,
      detail,
      messageCount: row._count.messages,
      lastMessageAt: row.lastMessageAt.toISOString(),
      lastMessagePreview: lastMessage ? chatPreview(lastMessage.body, 90) : null,
      lastMessageAuthor: lastMessage ? lastMessage.authorName : null,
    };
  });
}
