import { redirect } from "next/navigation";
import { Users, UserPlus } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { CreateUserForm } from "@/components/admin/create-user-form";
import { UsersTable } from "@/components/admin/users-table";
import { PageHeader, SectionCard } from "@/components/ui";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/");

  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  const activeCount = users.filter((u) => u.active).length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Users}
        title="Users"
        description="Manage team accounts, roles and access."
      />

      <SectionCard title="Add a user" description="Create an account and share the initial password" icon={UserPlus}>
        <CreateUserForm />
      </SectionCard>

      <SectionCard
        title="Team"
        description={`${activeCount} active · ${users.length} total`}
        icon={Users}
        bodyClassName="p-0"
      >
        <UsersTable users={users} currentUserId={session.user.id} />
      </SectionCard>
    </div>
  );
}
