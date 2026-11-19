import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, FileUp, PackagePlus } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { canRecordInstalledBase } from "@/lib/rbac";
import { Card, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/page-kit";
import { ImportInstalledForm } from "@/components/installed/import-installed-form";

export default async function ImportInstalledPage() {
  const user = await requireUser();
  if (!canRecordInstalledBase(user.role)) redirect("/warranty");

  return (
    <div className="space-y-5">
      <BackLink href="/warranty" label="Back to warranty" />
      <PageHeader
        icon={FileUp}
        title="Import installed machines"
        description="Bring in the machines of many customers from an Excel or CSV sheet: where each is installed, its capacity, the installation date, the warranty and any maintenance contract."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/warranty/installed/template" className="btn btn-secondary">
              <Download className="size-4" />
              Download template
            </Link>
            <Link href="/warranty/installed/new" className="btn btn-secondary">
              <PackagePlus className="size-4" />
              Add one by one
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Card className="p-4 sm:p-6">
          <ImportInstalledForm />
        </Card>

        <Card className="h-fit space-y-3 p-5 text-sm text-slate-600">
          <h2 className="text-sm font-semibold text-slate-900">How it works</h2>
          <ol className="list-decimal space-y-1.5 pl-4">
            <li>Use your own sheet, or download the template. Columns are matched by their headings, with the AI helping for unusual ones.</li>
            <li>Choose the file (.xlsx or .csv). Every sheet of a workbook is read.</li>
            <li>Press “Check file” to see what will happen and how the columns were understood. Nothing is saved yet.</li>
            <li>Fix anything listed under “Need fixing” in your sheet, or change a column, and check again.</li>
            <li>Press “Import” to record the machines. A big file is saved in steps.</li>
          </ol>
          <div className="space-y-2 text-xs text-slate-500">
            <p>
              <b className="font-medium text-slate-700">One row per customer and model.</b> Use the Quantity column when a hotel has several machines of the same model, or list the serial numbers.
            </p>
            <p>
              <b className="font-medium text-slate-700">Only the customer name and the installation date are required.</b> A month and year (Mar 2022) is accepted when the exact day is not known.
            </p>
            <p>
              <b className="font-medium text-slate-700">Warranty</b> can be written as 2 years, 18 months or an end date. If it is empty, the model&rsquo;s usual period is used. The warranty runs from the installation date.
            </p>
            <p>
              <b className="font-medium text-slate-700">AMC</b>: give the start date, and the period (1 year) or the end date, the charges and the visits per year. Leave these empty when there is no maintenance contract.
            </p>
            <p>
              <b className="font-medium text-slate-700">Customers with the same name in different cities are different customers</b> (the hotels of one group). Add the city to tell them apart. A customer already in the CRM gets the machines added to it.
            </p>
            <p>
              Running the same file twice is safe: machines already on record for the same customer, model and date are skipped.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
