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
        description="Bring in prospects from an Excel or CSV sheet, with their contacts and call notes. Customers already in the CRM are skipped."
        actions={
          <Link href="/leads/import/template" className="btn btn-secondary">
            <Download className="size-4" />
            Download template
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="p-6">
          <ImportLeadsForm admin={role === "ADMIN"} />
        </Card>

        <Card className="h-fit space-y-3 p-5 text-sm text-slate-600">
          <h2 className="text-sm font-semibold text-slate-900">How it works</h2>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>Use your own sheet, or download the template. Columns are matched by their headings, with the AI helping for unusual ones.</li>
            <li>Choose the file (.xlsx or .csv). Every sheet of a workbook is read.</li>
            <li>Optionally choose how much of it to bring in: the last few months, or between two dates.</li>
            <li>Press “Check file” to see what will happen and how the columns were understood. Nothing is saved yet.</li>
            <li>Press “Import” to add the leads. A big file is saved in steps.</li>
          </ol>
          <p className="text-xs text-slate-400">
            Only customer name and phone are required. If the sheet has a serial-number column (Sr.No.), a row without
            a number is another person on the prospect above it, such as the site in-charge or the contractor; a role in
            brackets after a name, like “(Owner)”, is kept as their role, and two people typed into one cell become two
            contacts. Remarks, Follow-up and Quote columns become the
            lead’s first follow-up. A lead is treated as a duplicate when its phone number
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
