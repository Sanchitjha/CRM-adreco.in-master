import { z } from "zod";
import { optionalText } from "@/lib/validation/common";

/**
 * The "add an existing installation" form. Every box arrives as text and is checked as a row by checkInstalledRow
 * (src/lib/installed-base.ts), the same way a row of an uploaded sheet is, so the two ways in follow the same rules.
 */
export const addInstalledSchema = z.object({
  customerMode: z.enum(["existing", "new"], { error: "Choose whether the customer is already in the CRM." }),
  leadId: optionalText,
  customerName: optionalText,
  phone: optionalText,
  email: optionalText,
  address: optionalText,
  contactPerson: optionalText,
  /** A catalogue machine, "other" for a model that is not in the catalogue, or nothing. */
  productId: optionalText,
  model: optionalText,
  capacityKw: optionalText,
  quantity: optionalText,
  serials: optionalText,
  installedOn: optionalText,
  /** "default" (the model's usual period), a number of months, or "custom" with an end date. */
  warrantyChoice: optionalText,
  warrantyEndsOn: optionalText,
  hasAmc: optionalText,
  amcStart: optionalText,
  /** A number of months, or "custom" with an end date. */
  amcTerm: optionalText,
  amcEnd: optionalText,
  amcAmount: optionalText,
  amcVisits: optionalText,
  amcParts: optionalText,
  notes: optionalText,
});
