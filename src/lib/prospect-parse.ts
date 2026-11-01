/**
 * Helpers for reading prospect sheets as sales teams actually keep them: names with the person's role in
 * brackets, an amount buried in a sentence about the quote, dates written day-first, an email typed into the
 * wrong column. Each one returns null rather than guessing wildly, so the importer can leave a field empty.
 */

/** The canonical role for a phrase like "Site Incharge" or "Plumbing Contractor", or null if it isn't a role. */
export function classifyRole(text: string): string | null {
  const spaced = text.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  if (!spaced) return null;
  const compact = spaced.replace(/ /g, "");
  const has = (re: RegExp) => re.test(compact);

  if (has(/plumb/)) return has(/contractor/) ? "Plumbing contractor" : "Plumber";
  if (has(/contractor/)) return has(/civil/) ? "Civil contractor" : "Contractor";
  if (has(/incharg/)) {
    if (has(/mep/)) return "MEP consultant";
    if (has(/project/)) return "Project in-charge";
    return has(/site/) ? "Site in-charge" : "In-charge";
  }
  if (has(/owner/)) return has(/brother|son|father|wife|family|relative/) ? "Owner's family" : "Owner";
  if (has(/partner/)) return "Partner";
  if (has(/director|proprietor/) || /^md$/.test(spaced)) return "Director";
  if (has(/architect/)) return "Architect";
  if (has(/pmc|projectmanagement/)) return "PMC";
  if (has(/mep/)) return "MEP consultant";
  if (has(/purchase|procurement/)) return "Purchase";
  if (has(/manager|gmo/) || /^gm$/.test(spaced)) return "Manager";
  if (has(/engineer/)) return "Engineer";
  if (has(/foreman|supervisor/)) return "Foreman";
  if (has(/consultant/)) return "Consultant";
  if (has(/mainperson|maincontact/)) return "Main contact";
  return null;
}

export type Person = { name: string; role: string | null };

// What people type between two names in one cell: "A (Owner), B", "A (Owner) / B", "A (Owner) & B", "A (Owner) and B".
const SEPARATOR = /^(?:[\s,;/&+–—-]|and\s)+/i;

/** A short run of words that starts with a capital letter and has no digits: a name, not a remark or a phone number. */
function looksLikeName(text: string): boolean {
  const first = text[0];
  return (
    /^\p{L}/u.test(text) &&
    first === first.toUpperCase() &&
    /\p{L}{2}/u.test(text) &&
    !/\d/.test(text) &&
    text.split(" ").length <= 4
  );
}

/**
 * The people named in one Name cell. "Mr. Dev Kohli (Partner)" is the name "Mr. Dev Kohli" with the role "Partner",
 * and a role followed by another name starts a second person: "Dev (Site Incharge) Mr. Kapoor" is Dev, the site
 * in-charge, and Mr. Kapoor. Brackets that don't hold a recognisable role, like "Anil Kumar (Ravi)", stay in the
 * name, and so does anything after a role that doesn't look like a name, so nothing typed is dropped. There is
 * always at least one entry; its name is empty when the cell is.
 */
export function splitPeople(raw: string): Person[] {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const people: Person[] = [];
  let start = 0;
  for (const bracket of cleaned.matchAll(/\(([^()]*)\)/g)) {
    const role = classifyRole(bracket[1]);
    const name = cleaned.slice(start, bracket.index).replace(SEPARATOR, "").trim();
    if (!role || !name) continue;
    people.push({ name, role });
    start = bracket.index + bracket[0].length;
  }

  const rest = cleaned.slice(start).replace(SEPARATOR, "").trim();
  if (people.length === 0 || (rest !== "" && !looksLikeName(rest))) return [{ name: cleaned, role: null }];
  return rest === "" ? people : [...people, { name: rest, role: null }];
}

/** The product category this text points at, using the CRM's default category names, or null. */
export function guessCategory(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bpools?\b|swimming|swmming/.test(t)) return "Swimming Pool Heat Pump";
  if (/hotel|resort|\brooms?\b|dairy|boiler|hospital|school|college|factory|industr|hospitality|restaurant|hostel|commercial|canteen|banquet/.test(t)) {
    return "Commercial Heat Pump";
  }
  if (/\bdom\b|domestic|bathroom|bath ?tubs?|villa|marla|kothi|bungalow|\bhouse\b|\bhome\b|residen|apartment|\bflat\b|geyser/.test(t)) {
    return "Domestic Heat Pump";
  }
  return null;
}

/**
 * The first rupee amount in a note such as "7kW, 500 L, 185000/-" or "33kW Heat Pump, 3,75,000/- + GST". Only
 * numbers of five to eight digits count, so capacities ("500 L"), sizes and phone numbers are ignored.
 */
export function firstAmount(text: string): number | null {
  // A long number followed by a unit ("10,000 L tank", "12000 kW") is a capacity, not a price.
  const match = text.replace(/,/g, "").match(/(?:^|[^0-9])(\d{5,8})(?![0-9])(?!\s*(?:l\b|lit|ltr|kw|units?))/i);
  return match ? Number(match[1]) : null;
}

export function extractEmail(text: string): string | null {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A calendar date as "YYYY-MM-DD". Accepts ISO dates and the day-first forms used in India: 18/11/2026,
 * 18-11-26, 18.11.2026, 18 Nov 2026, 18-Nov-26. Anything else, or an impossible date, is null.
 */
export function parseFlexibleDate(text: string): string | null {
  const s = text.trim();
  if (!s) return null;

  let year: number;
  let month: number;
  let day: number;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  } else if ((m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/))) {
    [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (year < 100) year += 2000;
  } else if ((m = s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?[\s,-]+(\d{2}|\d{4})$/))) {
    day = Number(m[1]);
    month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    year = Number(m[3]);
    if (year < 100) year += 2000;
    if (month === 0) return null;
  } else {
    return null;
  }

  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
