/**
 * Made-up sales data for demos and test copies of the CRM: prospects in the layout a sales team keeps its sheet in
 * (see lead-import.ts) and a small product catalogue. Every name, company and number is invented, and the phone
 * numbers start with 5 so none can be a real mobile number. Dates are relative to the day the sheet is made, so the
 * dashboard always has follow-ups that are overdue, due today and coming up. A given day always gives the same sheet.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export const DEMO_PROSPECT_COUNT = 40;

/** The columns of a sales team's sheet, plus the optional Source and Referred by columns the importer understands. */
export const DEMO_SHEET_HEADER = [
  "Date", "Sr.No.", "Contact No.", "Name", "Company Name/Location", "Project", "Follow-up", "Remarks", "Quote", "Source", "Referred by",
];

type Stage = "NEW" | "CONTACTED" | "FOLLOW_UP" | "QUOTED";
type Kind = "pool" | "commercial" | "domestic";

// How the 40 prospects are spread: a healthy pipeline has more people being chased than just enquiring.
const STAGES: [Stage, number][] = [["QUOTED", 14], ["FOLLOW_UP", 14], ["CONTACTED", 7], ["NEW", 5]];
const KINDS: [Kind, number][] = [["pool", 12], ["commercial", 16], ["domestic", 12]];

const MALE = [
  "Aarav", "Aditya", "Akash", "Amit", "Anand", "Arjun", "Farhan", "Gautam", "Girish", "Harsh", "Jatin", "Karan", "Lalit", "Manish",
  "Mohan", "Nikhil", "Omkar", "Prakash", "Rahul", "Rakesh", "Ramesh", "Rohan", "Sameer", "Sandeep", "Sanjay", "Suresh", "Tushar",
  "Uday", "Vikram", "Vinay", "Zubin",
];
const FEMALE = ["Anjali", "Deepa", "Divya", "Isha", "Kavita", "Meera", "Neha", "Nisha", "Pooja", "Rekha", "Sapna", "Shreya", "Tanvi"];
const SURNAMES = [
  "Kulkarni", "Deshpande", "Naik", "Pawar", "Joshi", "Iyer", "Menon", "Reddy", "Bhatt", "Chauhan", "Shetty", "Gokhale", "Patil",
  "Jadhav", "Kamat", "Rane", "Sawant", "Thakur", "Nair", "Pillai", "Banerjee", "Chatterjee", "Mukherjee", "Roy", "Mehta", "Shah",
  "Desai", "Parikh", "Trivedi", "Jain", "Khanna", "Malhotra", "Bajaj", "Hegde", "Kapoor", "Sethi", "Tandon", "Wagh",
];
const WORDS = [
  "Lakeview", "Sunrise", "Orchid", "Silver Oak", "Blue Lagoon", "Palm Grove", "Riverside", "Cedar", "Jade Garden", "Monsoon", "Aster",
  "Banyan", "Crescent", "Evergreen", "Fernhill", "Golden Reed", "Harmony", "Ivory", "Juniper", "Kingfisher",
];
const LOCATIONS = [
  "Baner, Pune", "Kothrud, Pune", "Wakad, Pune", "Gangapur Road, Nashik", "Dharampeth, Nagpur", "Vijay Nagar, Indore",
  "Malviya Nagar, Jaipur", "RS Puram, Coimbatore", "Vijayanagar, Mysuru", "Alkapuri, Vadodara", "Adajan, Surat",
  "Rajarampuri, Kolhapur", "Lonavala", "Calangute, Goa", "Edappally, Kochi", "Gomti Nagar, Lucknow", "Saheed Nagar, Bhubaneswar",
];
// Spellings as people type them; the importer turns each into one of the CRM's standard roles.
const CONTACT_ROLES = [
  "Owner", "Site Incharge", "Site Incharge", "Contractor", "Plumber", "Civil Contractor", "Architect", "PMC", "MEP Incharge",
  "Purchase Manager", "Manager", "Foreman", "Owner's Brother",
];
const SOURCES = [
  "Website enquiry", "Website enquiry", "Website enquiry", "Referral", "Referral", "Dealer", "Walk-in", "Exhibition", "Cold call",
  "Social media", "Repeat customer",
];

// What gets written in the Remarks cell at each stage; {d} and {e} become dates in the past, written like 14/10.
const REMARKS: Record<Stage, string[]> = {
  NEW: [""],
  CONTACTED: [
    "Called {d}, will share details on WhatsApp",
    "NR on {d} and {e}",
    "Spoke to site in-charge {d}, owner is travelling",
    "Brochure and price list sent {d}",
    "Called {d}, asked to call after the rains",
    "Message sent {d}, NR {e}",
  ],
  FOLLOW_UP: [
    "Interested. Site visit planned, spoke {d}",
    "Budget approval pending, spoke {d}",
    "Waiting for architect's drawings, called {d}",
    "Asked to call back, NR {d}",
    "Comparing running cost with a gas heater, spoke {d} and {e}",
    "Decision after the board meeting, spoke {d}",
    "Site visit done {d}, sizing in progress",
  ],
  QUOTED: [
    "Quote sent {d}, will revert",
    "Quote discussed {d}, asked for a better price",
    "Asked for two options, revised quote sent {e}",
    "Waiting for owner's approval, called {d}",
    "Payment terms under discussion, spoke {d}",
    "Site visit done {e}, quote sent {d}",
  ],
};

/** How long ago the enquiry arrived, in days, for a prospect at each stage. */
const AGE_DAYS: Record<Stage, [number, number]> = { NEW: [0, 5], CONTACTED: [5, 25], FOLLOW_UP: [10, 50], QUOTED: [20, 75] };

/** A small deterministic random number generator (mulberry32), so a given day always gives the same sheet. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Days since 1970-01-01 of the Indian calendar day that contains this moment. */
const indianDay = (now: Date) => Math.floor((now.getTime() + IST_OFFSET_MS) / DAY_MS);

const pad = (n: number) => String(n).padStart(2, "0");

/** "18/11/2026", the day-first form sales sheets use. */
function dayFirst(day: number): string {
  const d = new Date(day * DAY_MS);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

/** "18/11", how call dates are jotted down in the remarks. */
function shortDate(day: number): string {
  const d = new Date(day * DAY_MS);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

const round = (value: number, to: number) => Math.round(value / to) * to;

/**
 * A made-up prospect sheet for the day containing `now`: a header row, then 40 numbered prospects, some followed by
 * unnumbered rows for the other people on the project.
 */
export function demoProspectSheet(now: Date = new Date()): string[][] {
  const today = indianDay(now);
  const rnd = seeded(20261101);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)];
  const between = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
  const chance = (p: number) => rnd() < p;
  const shuffled = <T>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const spread = <T>(counts: [T, number][]) => shuffled(counts.flatMap(([value, n]) => Array.from({ length: n }, () => value)));

  let phoneSeq = 10000;
  const phone = () => `55501${++phoneSeq}`;

  const used = new Set<string>();
  const person = (): string => {
    for (;;) {
      const female = chance(0.3);
      const first = pick(female ? FEMALE : MALE);
      const honorific = female ? pick(["Ms.", "Ms.", "Mrs.", "Dr."]) : pick(["Mr.", "Mr.", "Mr.", "Dr.", "Capt.", "Adv."]);
      const name = chance(0.12) ? first : `${honorific} ${first} ${pick(SURNAMES)}`;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
  };
  const remarksFor = (stage: Stage) =>
    pick(REMARKS[stage])
      .replace("{d}", shortDate(today - between(2, 12)))
      .replace("{e}", shortDate(today - between(13, 24)));

  const stages = spread(STAGES);
  const kinds = spread(KINDS);
  // Two prospects have their site in-charge and the person to speak to typed into the same cell.
  const twoInOneCell = new Set([3, 21]);

  const rows: string[][] = [];
  for (let i = 0; i < DEMO_PROSPECT_COUNT; i++) {
    const stage = stages[i];
    const kind = kinds[i];

    let company: string;
    let project: string;
    let kw: number;
    if (kind === "pool") {
      kw = between(15, 55);
      if (chance(0.5)) {
        company = `${pick(WORDS)} Resort, ${pick(LOCATIONS)}`;
        project = `${between(15, 30)} x ${between(8, 15)} x ${between(3, 5)} Pool Size`;
      } else if (chance(0.5)) {
        company = `${pick(WORDS)} Sports Club, ${pick(LOCATIONS)}`;
        project = `Club swimming pool, ${between(20, 30)} m`;
      } else {
        company = `Villa ${between(2, 60)}, ${pick(LOCATIONS)}`;
        kw = between(10, 22);
        project = `${between(8, 14)} x ${between(5, 8)} x ${between(3, 4)} Pool Size, private villa`;
      }
    } else if (kind === "commercial") {
      kw = between(20, 90);
      const where = pick(LOCATIONS);
      const options: [string, string][] = [
        [`Hotel ${pick(WORDS)}, ${where}`, `${between(18, 90)} Rooms Hotel`],
        [`${pick(WORDS)} Resort, ${where}`, `${between(24, 60)} Rooms Resort, kitchen and spa`],
        [`${pick(WORDS)} Care Hospital, ${where}`, `Hospital, ${between(40, 150)} Beds`],
        [`${pick(WORDS)} Boys Hostel, ${where}`, `Hostel, ${between(30, 120)} Rooms`],
        [`${pick(WORDS)} Dairy, ${where}`, `Dairy, ${between(3, 10)}000 L hot water, boiler replacement`],
        [`${pick(WORDS)} Banquets, ${where}`, `Banquet hall and kitchen, ${between(2, 6)}000 L hot water`],
      ];
      [company, project] = pick(options);
    } else {
      kw = between(5, 12);
      const where = pick(LOCATIONS);
      const options: [string, string][] = [
        [`Villa ${between(2, 60)}, ${where}`, `Villa, ${between(3, 6)} Bathrooms`],
        [`${pick(SURNAMES)} Residence, ${where}`, `${between(2, 5)} Bathrooms, ${between(1, 3)} Bath Tubs`],
        [`${pick(WORDS)} Heights Apartments, ${where}`, `${between(3, 10)}00 L Dom, apartment block`],
        [`${pick(SURNAMES)} Farmhouse, ${where}`, `Bungalow, ${between(4, 8)} Bedrooms`],
      ];
      [company, project] = pick(options);
    }
    if (chance(0.1)) project += `, info@${company.split(",")[0].toLowerCase().replace(/[^a-z0-9]/g, "")}.example.com`;

    const perKw = kind === "domestic" ? between(24000, 28000) : kind === "pool" ? between(10500, 12500) : between(10000, 12000);
    const price = round(kw * perKw, 1000);
    const units = kind === "commercial" && kw >= 60 ? 2 : 1;
    const quote =
      stage !== "QUOTED" ? ""
      : kind === "domestic" ? `${kw}kW ${pick([300, 500, 800, 1000])}L, ${price}/-`
      : kind === "pool" ? `${kw}kW Pool Heat Pump, ${price}/-`
      : units > 1 ? `${Math.round(kw / units)}kW x ${units} Units, ${price}/-`
      : pick([`${kw}kW Heat Pump, ${price}/-`, `${kw}kW Heat Pump, ${price}/- + GST`]);

    const roleTag = chance(0.3) ? ` (${pick(["Owner", "Partner", "Director", "Manager"])})` : "";
    const name = twoInOneCell.has(i) ? `${pick(MALE)} (Site Incharge) Mr. ${pick(MALE)} ${pick(SURNAMES)}` : `${person()}${roleTag}`;

    let followUp = "";
    if (stage === "FOLLOW_UP" || (stage === "QUOTED" && chance(0.75))) {
      const roll = rnd();
      const offset = roll < 0.28 ? -between(1, 9) : roll < 0.38 ? 0 : between(1, 35);
      followUp = dayFirst(today + offset);
    }

    const [youngest, oldest] = AGE_DAYS[stage];
    const source = pick(SOURCES);
    const referredBy = source === "Referral" ? pick(["Existing customer", `Architect Mr. ${pick(SURNAMES)}`, `Plumber Mr. ${pick(SURNAMES)}`, "Hotel association"]) : "";

    rows.push([
      dayFirst(today - between(youngest, oldest)), String(i + 1), phone(), name, company, project, followUp, remarksFor(stage), quote, source, referredBy,
    ]);

    // Other people on the project get their own unnumbered rows. A prospect nobody has spoken to yet has none, so it stays new.
    if (stage !== "NEW" && chance(0.5)) {
      for (let c = between(1, 2); c > 0; c--) {
        const role = pick(CONTACT_ROLES);
        const label = chance(0.8) ? `${person()} (${role})` : person();
        const note = chance(0.35) ? `Visited the site on ${shortDate(today - between(2, 20))}` : "";
        rows.push(["", "", phone(), label, "", "", "", note, "", "", ""]);
      }
    }
  }
  return [DEMO_SHEET_HEADER, ...rows];
}

/** A small catalogue so quotations can be made in a demo. The model codes say DEMO, so nobody mistakes them for real ones. */
export const DEMO_PRODUCTS = [
  { name: "Domestic Heat Pump 7 kW", modelCode: "DEMO-D07", category: "Domestic Heat Pump", series: "Home", description: "Hot water for a villa or flat, about 500 L a day.", heatingCapacityKw: 7, inputPowerKw: 1.6, cop: 4.4, refrigerant: "R32", warrantyMonths: 24, dealerPrice: 150000, customerPrice: 185000, stockQty: 6 },
  { name: "Domestic Heat Pump 12 kW", modelCode: "DEMO-D12", category: "Domestic Heat Pump", series: "Home", description: "Hot water for a large home or a small apartment block.", heatingCapacityKw: 12, inputPowerKw: 2.7, cop: 4.4, refrigerant: "R32", warrantyMonths: 24, dealerPrice: 235000, customerPrice: 290000, stockQty: 4 },
  { name: "Commercial Heat Pump 33 kW", modelCode: "DEMO-C33", category: "Commercial Heat Pump", series: "Pro", description: "Hot water for a hotel, hostel or hospital wing.", heatingCapacityKw: 33, inputPowerKw: 7.4, cop: 4.5, refrigerant: "R410A", warrantyMonths: 36, dealerPrice: 310000, customerPrice: 375000, stockQty: 3 },
  { name: "Commercial Heat Pump 52 kW", modelCode: "DEMO-C52", category: "Commercial Heat Pump", series: "Pro", description: "Large hotel, dairy or kitchen hot water.", heatingCapacityKw: 52, inputPowerKw: 11.5, cop: 4.5, refrigerant: "R410A", warrantyMonths: 36, dealerPrice: 500000, customerPrice: 625000, stockQty: 2 },
  { name: "Pool Heat Pump 21 kW", modelCode: "DEMO-P21", category: "Swimming Pool Heat Pump", series: "Aqua", description: "Keeps a private pool comfortable all year.", heatingCapacityKw: 21, inputPowerKw: 3.9, cop: 5.4, refrigerant: "R32", warrantyMonths: 24, dealerPrice: 195000, customerPrice: 240000, stockQty: 5 },
  { name: "Pool Heat Pump 33 kW", modelCode: "DEMO-P33", category: "Swimming Pool Heat Pump", series: "Aqua", description: "Resort and club pools.", heatingCapacityKw: 33, inputPowerKw: 6.1, cop: 5.4, refrigerant: "R32", warrantyMonths: 24, dealerPrice: 280000, customerPrice: 345000, stockQty: 3 },
];
