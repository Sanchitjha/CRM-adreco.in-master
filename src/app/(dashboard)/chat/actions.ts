"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { openDirectChannel, postMessage } from "@/lib/chat";
import type { SendResult } from "@/lib/chat-types";

/** Server functions can be called with anything, so the shape is checked here and not trusted from the types. */
function readTarget(target: unknown): { channelId: string } | { leadId: string } | null {
  if (!target || typeof target !== "object") return null;
  const t = target as Record<string, unknown>;
  if (typeof t.channelId === "string" && t.channelId) return { channelId: t.channelId };
  if (typeof t.leadId === "string" && t.leadId) return { leadId: t.leadId };
  return null;
}

export async function sendChatMessage(target: { channelId: string } | { leadId: string }, body: string): Promise<SendResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Please sign in again." };

  const checked = readTarget(target);
  if (!checked) return { ok: false, error: "That conversation is not available." };

  return postMessage({ id: session.user.id, role: session.user.role }, checked, body);
}

/** Opens (or starts) the private conversation with a colleague and goes to it. */
export async function startDirectChat(formData: FormData): Promise<void> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const otherId = formData.get("userId");
  if (typeof otherId !== "string" || !otherId) redirect("/chat");

  const channelId = await openDirectChannel(session.user.id, otherId);
  redirect(channelId ? `/chat/${channelId}` : "/chat");
}
