import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Gavel, LifeBuoy, ShieldCheck, Wrench } from "lucide-react";
import { requireUser } from "@/lib/action-auth";
import { prisma } from "@/lib/db";
import { canManage, canView } from "@/lib/rbac";
import { canSeeLead } from "@/lib/scope";
import { formatDate, formatDateTime } from "@/lib/dates";
import { CLAIM_STATUS } from "@/lib/statuses";
import { SectionCard } from "@/components/ui";
import { ActivityTimeline, BackLink, CustomerLink, InfoGrid, StatusPill } from "@/components/page-kit";
import { AutoForm } from "@/components/auto-form";
import { decideClaim, resolveClaim } from "../../actions";

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!canView(user.role, "warranty")) redirect("/");

  const claim = await prisma.warrantyClaim.findUnique({
    where: { id },
    include: {
      serialNumber: { include: { product: true, lead: true } },
      ticket: true,
      createdBy: true,
      decidedBy: true,
    },
  });
  if (!claim) notFound();
  const { serialNumber: unit } = claim;
  if (user.role === "SALES" && (!unit.lead || !canSeeLead(user.role, user.id, unit.lead))) notFound();

  const isAdmin = user.role === "ADMIN";
  const manage = canManage(user.role, "warranty");

  return (
    <div className="space-y-6">
      <BackLink href="/warranty?view=claims" label="Back to claims" />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{claim.claimNumber}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Raised {formatDate(claim.createdAt)} by {claim.createdBy.name}
          </p>
        </div>
        <StatusPill meta={CLAIM_STATUS[claim.status]} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Claim" icon={ShieldCheck}>
            <h2 className="text-base font-semibold text-slate-900">{claim.issue}</h2>
            <div className="mt-4">
              <InfoGrid
                items={[
                  {
                    label: "Machine",
                    value: canView(user.role, "serials") ? (
                      <Link href={`/serial-numbers/${unit.id}`} className="font-medium text-slate-800 hover:text-brand-600">
                        {unit.serialNo} · {unit.product.name}
                      </Link>
                    ) : (
                      `${unit.serialNo} · ${unit.product.name}`
                    ),
                  },
                  {
                    label: "Customer",
                    value: unit.lead ? <CustomerLink role={user.role} leadId={unit.lead.id} name={unit.lead.customerName} /> : null,
                  },
                  { label: "Warranty ends", value: formatDate(unit.warrantyEndsOn) },
                  {
                    label: "Service ticket",
                    value:
                      claim.ticket && canView(user.role, "tickets") ? (
                        <Link href={`/tickets/${claim.ticket.id}`} className="inline-flex items-center gap-1 font-medium text-slate-800 hover:text-brand-600">
                          <LifeBuoy className="size-3.5" />
                          {claim.ticket.ticketNumber}
                        </Link>
                      ) : null,
                  },
                  { label: "Parts claimed", value: claim.claimedParts },
                ]}
              />
            </div>
          </SectionCard>

          {claim.status !== "SUBMITTED" && (
            <SectionCard title="Decision" icon={Gavel}>
              <InfoGrid
                items={[
                  { label: "Decision", value: claim.status === "REJECTED" ? "Rejected" : "Approved" },
                  { label: "Decided by", value: claim.decidedBy ? `${claim.decidedBy.name} · ${formatDateTime(claim.decidedAt)}` : null },
                  { label: "Note", value: claim.decisionNote },
                ]}
              />
            </SectionCard>
          )}

          {claim.status === "RESOLVED" && (
            <SectionCard title="Resolution" icon={Wrench}>
              <p className="whitespace-pre-line text-sm text-slate-700">{claim.resolution}</p>
              <p className="mt-2 text-xs text-slate-400">Resolved {formatDateTime(claim.resolvedAt)}</p>
            </SectionCard>
          )}

          <ActivityTimeline entityType="WarrantyClaim" entityId={claim.id} />
        </div>

        <div className="space-y-6">
          {claim.status === "SUBMITTED" && (
            <SectionCard title="Decision" description="Administrator approval" icon={Gavel}>
              {isAdmin ? (
                <AutoForm
                  action={decideClaim}
                  submitLabel="Record decision"
                  columns={1}
                  compact
                  fields={[
                    { kind: "hidden", name: "claimId", value: claim.id },
                    {
                      kind: "select",
                      name: "decision",
                      label: "Decision",
                      required: true,
                      options: [
                        { value: "APPROVED", label: "Approve" },
                        { value: "REJECTED", label: "Reject" },
                      ],
                    },
                    { name: "decisionNote", label: "Note", kind: "textarea", rows: 3, hint: "Required when rejecting." },
                  ]}
                />
              ) : (
                <p className="text-sm text-slate-500">Waiting for an administrator to approve or reject this claim.</p>
              )}
            </SectionCard>
          )}

          {claim.status === "APPROVED" && manage && (
            <SectionCard title="Resolve claim" description="Record what was done" icon={Wrench}>
              <AutoForm
                action={resolveClaim}
                submitLabel="Mark resolved"
                columns={1}
                compact
                fields={[
                  { kind: "hidden", name: "claimId", value: claim.id },
                  { name: "resolution", label: "Resolution", kind: "textarea", rows: 4, required: true, placeholder: "Parts replaced, repair done…" },
                ]}
              />
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
