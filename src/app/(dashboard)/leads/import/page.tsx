import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download, FileUp } from "lucide-react";
import { auth } from "@/auth";
import { ImportLeadsForm } from "@/components/leads/import-leads-form";
import { PageHeader, Card } from "@/components/ui";

export default async function ImportLeadsPage() {
  const session = await auth();
  const role = session!.user.role;
  if (role !== "ADMIN" && role !== "SALES") redirect("/leads");

  return (
    <div className="space-y-6">
      <Link href="/leads" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" />
        Back to leads
      </Link>

      <PageHeader
        icon={FileUp}
        title="Import leads"
        description="Bring in enquiries from a spreadsheet. Customers already in the CRM are skipped."
        actions={
          <Link href="/leads/import/template" className="btn btn-secondary">
            <Download className="size-4" />
            Download template
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="p-6">
          <ImportLeadsForm />
        </Card>

        <Card className="h-fit space-y-3 p-5 text-sm text-slate-600">
          <h2 className="text-sm font-semibold text-slate-900">How it works</h2>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>Download the template and paste your leads under its headings.</li>
            <li>Save it as CSV and choose the file.</li>
            <li>Press “Check file” to see what will happen. Nothing is saved yet.</li>
            <li>Press “Import” to add the leads.</li>
          </ol>
          <p className="text-xs text-slate-400">
            Only customer name and phone are required. A lead is treated as a duplicate when its phone number
            (ignoring +91 and spaces) or email is already in the CRM.
            {role === "ADMIN"
              ? " Add an “Owner email” column to assign leads to a salesperson; otherwise they are left unassigned."
              : " Imported leads are assigned to you."}
          </p>
        </Card>
      </div>
    </div>
  );
}
