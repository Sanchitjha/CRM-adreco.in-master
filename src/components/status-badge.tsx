import type { LeadStatus } from "@prisma/client";
import { Badge, type BadgeTone } from "@/components/ui";

const STATUS_TONES: Record<LeadStatus, BadgeTone> = {
  NEW: "neutral",
  CONTACTED: "info",
  FOLLOW_UP: "warning",
  QUOTED: "purple",
  CONVERTED: "success",
  LOST: "danger",
};

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  FOLLOW_UP: "Follow-up",
  QUOTED: "Quoted",
  CONVERTED: "Converted",
  LOST: "Lost",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
