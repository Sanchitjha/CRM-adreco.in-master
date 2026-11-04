import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { accessTo, listMessages, loadChannel, markChannelRead } from "@/lib/chat";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The messages of one conversation. `after` (an ISO time) returns only messages from that moment on; the caller
 * drops the ones it already has. With `markRead=1` the conversation counts as read up to the newest message sent
 * back, which the screen asks for only while the person is looking at it.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  const viewer = { id: session.user.id, role: session.user.role };

  const params = new URL(request.url).searchParams;
  const channelId = params.get("channelId");
  if (!channelId) return NextResponse.json({ error: "Missing channelId" }, { status: 400, headers: NO_STORE });

  const afterRaw = params.get("after");
  const after = afterRaw ? new Date(afterRaw) : undefined;
  if (after && Number.isNaN(after.getTime())) {
    return NextResponse.json({ error: "Invalid after" }, { status: 400, headers: NO_STORE });
  }

  const channel = await loadChannel(channelId);
  // The same answer whether it does not exist or the person may not see it, so ids cannot be probed.
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  const access = accessTo(viewer, channel);
  if (!access.canRead) return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });

  const messages = await listMessages(channelId, { after });

  if (params.get("markRead") === "1" && !access.oversight && messages.length > 0) {
    await markChannelRead(viewer.id, channelId, new Date(messages[messages.length - 1].createdAt));
  }

  return NextResponse.json({ messages }, { headers: NO_STORE });
}
