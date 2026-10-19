import type { SurveyStatus } from "@prisma/client";
import { Badge, type BadgeTone } from "@/components/ui";
import { SURVEY_STATUS_LABELS } from "@/lib/validation/survey";

const TONES: Record<SurveyStatus, BadgeTone> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  REVIEWED: "success",
};

export function SurveyStatusBadge({ status }: { status: SurveyStatus }) {
  return (
    <Badge tone={TONES[status]} dot>
      {SURVEY_STATUS_LABELS[status]}
    </Badge>
  );
}
