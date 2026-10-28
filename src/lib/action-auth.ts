import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";

export type SessionUser = { id: string; role: Role; name: string };

/** Current signed-in user for a server action or page; sends anonymous visitors to the login screen. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return { id: session.user.id, role: session.user.role, name: session.user.name ?? "" };
}
