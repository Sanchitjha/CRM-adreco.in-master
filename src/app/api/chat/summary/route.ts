import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listChannelsFor, totalUnread } from "@/lib/chat";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Polled by the chat screens. Plain call: just the unread total, for the menu badge. With `?full=1`: the whole
 * conversation list with unread counts and the latest message of each.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  const viewer = { id: session.user.id, role: session.user.role };

  if (new URL(request.url).searchParams.get("full") === "1") {
    const channels = await listChannelsFor(viewer);
    const unreadTotal = channels.reduce((sum, c) => sum + c.unread, 0);
    return NextResponse.json({ channels, unreadTotal }, { headers: NO_STORE });
  }

  return NextResponse.json({ unreadTotal: await totalUnread(viewer) }, { headers: NO_STORE });
}
