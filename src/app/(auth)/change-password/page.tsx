import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, KeyRound } from "lucide-react";
import { auth } from "@/auth";
import { AutoForm, type FieldDef } from "@/components/auto-form";
import { BrandLogo } from "@/components/brand-mark";
import { changePassword } from "./actions";

const FIELDS: FieldDef[] = [
  { name: "currentPassword", label: "Current password", kind: "password", required: true, autoComplete: "current-password" },
  {
    name: "newPassword",
    label: "New password",
    kind: "password",
    required: true,
    autoComplete: "new-password",
    hint: "At least 8 characters, with a letter and a number.",
  },
  { name: "confirmPassword", label: "Confirm new password", kind: "password", required: true, autoComplete: "new-password" },
];

export default async function ChangePasswordPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const required = session.user.mustChangePassword;

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <BrandLogo subtitle="Engineering CRM" />
        </div>

        <div className="flex items-center gap-2 text-brand-600">
          <KeyRound className="size-5" />
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            {required ? "Choose a new password" : "Change password"}
          </h1>
        </div>
        <p className="mt-1.5 text-sm text-slate-500">
          {required
            ? "Your administrator gave you a temporary password. Set one of your own to continue."
            : "Use a password you don’t use anywhere else."}
        </p>

        <div className="mt-6">
          <AutoForm
            action={changePassword}
            fields={FIELDS}
            columns={1}
            submitLabel={required ? "Save and continue" : "Change password"}
            pendingLabel="Saving…"
          />
        </div>

        {!required && (
          <Link href="/" className="mt-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft className="size-4" />
            Back to dashboard
          </Link>
        )}
      </div>
    </div>
  );
}
