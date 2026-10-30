import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/rbac";
import { AppShell, type NotificationItem } from "@/components/app-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { role, id: userId, name } = session.user;

  const [recent, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  const notifications: NotificationItem[] = recent.map((n) => ({
    id: n.id,
    message: n.message,
    createdAt: n.createdAt.toISOString(),
    read: n.read,
    leadId: n.leadId,
  }));

  return (
    <AppShell
      role={role}
      userName={name ?? "User"}
      roleLabel={ROLE_LABELS[role]}
      notifications={notifications}
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
