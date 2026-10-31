/** Suggestions offered when recording who someone is on a project. Free text is still allowed. */
export const CONTACT_ROLES = [
  "Owner",
  "Owner's family",
  "Partner",
  "Director",
  "Site in-charge",
  "Project in-charge",
  "In-charge",
  "Contractor",
  "Civil contractor",
  "Plumber",
  "Plumbing contractor",
  "Architect",
  "PMC",
  "MEP consultant",
  "Consultant",
  "Purchase",
  "Manager",
  "Engineer",
  "Foreman",
  "Main contact",
] as const;

/** Where a project stands, which tells the sales team how soon to follow up. */
export const PROJECT_STAGES = [
  "Planning",
  "Early construction",
  "Under construction",
  "Near completion",
  "Completed (retrofit)",
  "On hold",
] as const;
