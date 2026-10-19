import type { QuoteStatus } from "@prisma/client";
import { Badge, type BadgeTone } from "@/components/ui";
import { QUOTE_STATUS_LABELS } from "@/lib/validation/quotation";

const TONES: Record<QuoteStatus, BadgeTone> = {
  DRAFT: "neutral",
  SENT: "info",
  ACCEPTED: "success",
  REJECTED: "danger",
};

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return (
    <Badge tone={TONES[status]} dot>
      {QUOTE_STATUS_LABELS[status]}
    </Badge>
  );
}
