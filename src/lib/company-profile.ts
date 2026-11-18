/**
 * What the printed documents need from Settings → Company profile. Kept free of the database so it can be tested and
 * shared by the quotation pages.
 */

export type CompanyProfileLike = {
  legalName?: string | null;
  tradeName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  gstin?: string | null;
} | null;

/** The street address with the city, state and PIN code after it, as one line; empty when none is saved. */
export function formatCompanyAddress(company: CompanyProfileLike): string {
  if (!company) return "";
  const place = [company.city, company.state, company.pincode].map((p) => p?.trim()).filter(Boolean).join(", ");
  return [company.address?.trim(), place].filter(Boolean).join(", ");
}

/** What a quotation should carry on every page but cannot, because Settings has no value for it yet. */
export function missingCompanyDetails(company: CompanyProfileLike): ("logo" | "address")[] {
  const missing: ("logo" | "address")[] = [];
  if (!company?.logoUrl?.trim()) missing.push("logo");
  if (!formatCompanyAddress(company)) missing.push("address");
  return missing;
}

/** "logo and address", "address" … for a sentence. */
export function listMissing(missing: ("logo" | "address")[]): string {
  return missing.join(" and ");
}
