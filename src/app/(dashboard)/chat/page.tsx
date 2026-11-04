import Link from "next/link";
import { Eye, MessagesSquare } from "lucide-react";
import { auth } from "@/auth";

export default async function ChatHomePage() {
  const session = await auth();

  return (
    <div className="hidden h-full flex-col items-center justify-center gap-2 px-6 text-center md:flex">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <MessagesSquare className="size-7" strokeWidth={1.75} />
      </span>
      <p className="mt-2 text-sm font-medium text-slate-700">Pick a conversation, or start a new one</p>
      <p className="max-w-sm text-sm text-slate-400">
        Talk to your colleagues about anything related to work. Administrators can read these conversations.
      </p>
      {session?.user.role === "ADMIN" && (
        <Link href="/admin/chats" className="btn btn-secondary btn-sm mt-2">
          <Eye className="size-3.5" />
          Read all conversations
        </Link>
      )}
    </div>
  );
}
