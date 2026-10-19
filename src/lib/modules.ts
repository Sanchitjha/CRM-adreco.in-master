import {
  ShoppingCart,
  Wrench,
  Gauge,
  Package,
  ScanBarcode,
  LifeBuoy,
  ShieldCheck,
  CalendarClock,
  Handshake,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type ModuleDef = {
  slug: string;
  title: string;
  tagline: string;
  stage: string;
  icon: LucideIcon;
  description: string;
  features: string[];
};

/** Roadmap modules that extend the core Lead → Service pipeline. */
export const MODULES: Record<string, ModuleDef> = {
  "sales-orders": {
    slug: "sales-orders",
    title: "Sales orders",
    tagline: "Convert an approved quote into a confirmed order",
    stage: "Sales",
    icon: ShoppingCart,
    description:
      "Once a quotation is accepted it becomes a sales order carrying delivery dates, payment terms and dispatch details through to installation.",
    features: [
      "One-click convert from an approved quotation",
      "Delivery date, payment terms, billing and shipping address",
      "Dispatch with serial numbers, transporter and e-way bill",
      "Order status — confirmed → production → dispatched → delivered",
      "Links back to the customer's full project record",
    ],
  },
  installations: {
    slug: "installations",
    title: "Installations",
    tagline: "Schedule and track installation jobs",
    stage: "Projects",
    icon: Wrench,
    description:
      "Assign installation jobs to technicians with a site checklist, photos and customer sign-off — visible to the office in real time.",
    features: [
      "Job assignment with scheduled date and site address",
      "Installation checklist and on-site photos",
      "Technician status — pending → scheduled → in progress → completed",
      "Customer signature captured on completion",
      "Equipment serial numbers linked to the installation",
    ],
  },
  commissioning: {
    slug: "commissioning",
    title: "Commissioning",
    tagline: "Validate performance and start the warranty clock",
    stage: "Projects",
    icon: Gauge,
    description:
      "A commissioning checklist that confirms the system performs to spec — and automatically starts the warranty period on sign-off.",
    features: [
      "Checklist — electrical, water flow, temperature, pressure, performance",
      "Customer demonstration and approval",
      "Engineer remarks and commissioning photos",
      "Warranty start date set automatically on completion",
    ],
  },
  products: {
    slug: "products",
    title: "Product catalog",
    tagline: "A technical master for every heat-pump model",
    stage: "Catalog",
    icon: Package,
    description:
      "More than a name — a full technical master with capacity, COP, refrigerant and compressor details, plus dealer and customer pricing.",
    features: [
      "Categories — commercial, domestic, EVI, central heating, pool",
      "Specs — heating capacity, input power, COP, refrigerant, compressor",
      "Operating range, heat-exchanger type and warranty period",
      "Variants by capacity with their own price and specification",
      "Brochures, datasheets and installation manuals",
    ],
  },
  "serial-numbers": {
    slug: "serial-numbers",
    title: "Serial numbers",
    tagline: "Every machine's lifecycle, from one search",
    stage: "Catalog",
    icon: ScanBarcode,
    description:
      "A unique identity for each unit that ties together dispatch, installation, commissioning, warranty, parts and service history.",
    features: [
      "Manufacturing → dispatch → install → commissioning trail",
      "Warranty start and expiry per unit",
      "Full service-call and parts-replacement history",
      "Search a serial number to open the machine's complete story",
    ],
  },
  "service-tickets": {
    slug: "service-tickets",
    title: "Service tickets",
    tagline: "From complaint to closed, with the technician in the field",
    stage: "Service",
    icon: LifeBuoy,
    description:
      "Log complaints against a specific machine, assign technicians, and run the visit end-to-end from a mobile-friendly technician view.",
    features: [
      "Ticket linked to customer, product, serial number and warranty status",
      "Priority and SLA tracking",
      "Workflow — assigned → visit → diagnosis → parts → repair → closed",
      "Technician actions: check-in, photos, parts used, customer signature",
      "Spare parts consumed reduce inventory automatically",
    ],
  },
  warranty: {
    slug: "warranty",
    title: "Warranty",
    tagline: "Never miss an expiry — or an opportunity",
    stage: "Service",
    icon: ShieldCheck,
    description:
      "Track active warranties per serial number, flag upcoming expiries, and manage claims and replacements.",
    features: [
      "Active, expiring-in-30-days and expired dashboards",
      "Warranty claims with parts, approval and resolution",
      "Alerts turn an out-of-warranty complaint into an AMC opportunity",
    ],
  },
  amc: {
    slug: "amc",
    title: "AMC contracts",
    tagline: "Preventive maintenance and renewals on autopilot",
    stage: "Service",
    icon: CalendarClock,
    description:
      "Annual maintenance contracts covering specific machines, with scheduled preventive visits and automated renewal reminders.",
    features: [
      "Contract with covered machines, visit frequency and covered parts",
      "Preventive-maintenance scheduling and history",
      "Renewal reminders at 60, 30 and 7 days",
      "Dashboard of contracts expiring this month",
    ],
  },
  dealers: {
    slug: "dealers",
    title: "Dealers",
    tagline: "Channel partners, targets and dealer-sourced leads",
    stage: "Partners",
    icon: Handshake,
    description:
      "Manage the dealer and distributor network — territory, targets, outstanding balances, and the leads they bring in.",
    features: [
      "Dealer profile — territory, contacts, products and stock",
      "Targets, achievement and incentive schemes",
      "Dealer-sourced leads tracked back to the partner",
      "Outstanding balances and complaint history",
    ],
  },
  settings: {
    slug: "settings",
    title: "Settings",
    tagline: "Configure the CRM to how Adreco works",
    stage: "Administration",
    icon: Settings,
    description:
      "Company details, pipeline configuration and the reference data that the rest of the CRM draws on.",
    features: [
      "Company profile, logo and GST details",
      "Lead sources, pipeline stages and payment terms",
      "Product categories, units and warranty periods",
      "Service SLAs, priorities and complaint types",
      "Territories and sales regions",
    ],
  },
};

export const MODULE_SLUGS = Object.keys(MODULES);
