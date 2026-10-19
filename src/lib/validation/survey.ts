import { z } from "zod";

export const SURVEY_STATUS_VALUES = ["DRAFT", "SUBMITTED", "REVIEWED"] as const;

export const SURVEY_STATUS_LABELS: Record<(typeof SURVEY_STATUS_VALUES)[number], string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  REVIEWED: "Reviewed",
};

export const APPLICATIONS = [
  "Hotel",
  "Hospital",
  "Hostel",
  "Residential",
  "Swimming Pool",
  "Industrial",
  "Factory",
  "Commercial",
  "Institution",
] as const;

export const ELECTRICAL_SUPPLY = ["Single-phase", "Three-phase"] as const;

export const INSTALL_LOCATIONS = ["Indoor", "Outdoor", "Rooftop", "Basement"] as const;

/** Optional non-negative integer coming from a text/number input (blank allowed). */
const optionalInt = z
  .union([z.coerce.number().int().nonnegative(), z.literal("")])
  .optional();

const optionalText = z.string().trim().optional();

export const createSurveySchema = z.object({
  leadId: z.string().min(1, "Choose a lead"),
  application: z.string().trim().min(1, "Application is required"),
  siteAddress: optionalText,
  ambientTempC: optionalInt,
  requiredTempC: optionalInt,
  dailyDemandL: optionalInt,
  peakHourL: optionalInt,
  numberOfUsers: optionalInt,
  poolSize: optionalText,
  existingSystem: optionalText,
  electricalSupply: optionalText,
  installLocation: optionalText,
  pipingDetails: optionalText,
  storageTank: optionalText,
  recommendedModel: optionalText,
  recommendedCapacityKw: optionalInt,
  recommendedQty: optionalInt,
  engineerRemarks: optionalText,
});

export const updateSurveyStatusSchema = z.object({
  surveyId: z.string().min(1),
  status: z.enum(SURVEY_STATUS_VALUES),
});
