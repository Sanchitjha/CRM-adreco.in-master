import Link from "next/link";
import { ArrowLeft, Contact } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { NewLeadForm } from "@/components/leads/new-lead-form";
import { PageHeader, Card } from "@/components/ui";

export default async function NewLeadPage() {
  const session = await auth();
  const isAdmin = session!.user.role === "ADMIN";

  const salesUsers = isAdmin
    ? await prisma.user.findMany({
        where: { role: "SALES", active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : null;

  return (
    <div className="space-y-6">
      <Link href="/leads" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" />
        Back to leads
      </Link>

      <PageHeader icon={Contact} title="New lead" description="Capture the enquiry and the customer's requirement." />

      <Card className="max-w-2xl p-6">
        <NewLeadForm salesUsers={salesUsers} />
      </Card>
    </div>
  );
}
