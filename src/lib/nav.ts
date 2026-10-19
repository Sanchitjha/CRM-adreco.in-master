import type { Role } from "@prisma/client";
import {
  LayoutDashboard,
  Contact,
  Inbox,
  ClipboardList,
  ClipboardCheck,
  FileText,
  ShoppingCart,
  Wrench,
  Gauge,
  Package,
  ScanBarcode,
  LifeBuoy,
  ShieldCheck,
  CalendarClock,
  Handshake,
  Users,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
  /** Roadmap module — routed to a shared preview page, shown to admins only. */
  planned?: boolean;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

const ALL_ROLES: Role[] = ["ADMIN", "SALES", "DESIGN", "ACCOUNTS", "INSTALLATION", "SERVICE"];
const DEPARTMENT_ROLES: Role[] = ["DESIGN", "ACCOUNTS", "INSTALLATION", "SERVICE"];
const ADMIN_ONLY: Role[] = ["ADMIN"];

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", href: "/", icon: LayoutDashboard, roles: ALL_ROLES }],
  },
  {
    title: "Pipeline",
    items: [
      { label: "Leads", href: "/leads", icon: Contact, roles: ["ADMIN", "SALES"] },
      { label: "Department queue", href: "/queue", icon: Inbox, roles: DEPARTMENT_ROLES },
      { label: "Tasks", href: "/tasks", icon: ClipboardList, roles: ALL_ROLES },
    ],
  },
  {
    title: "Sales",
    items: [
      { label: "Site surveys", href: "/surveys", icon: ClipboardCheck, roles: ["ADMIN", "SALES", "DESIGN"] },
      { label: "Quotations", href: "/quotations", icon: FileText, roles: ["ADMIN", "SALES", "DESIGN"] },
      { label: "Sales orders", href: "/modules/sales-orders", icon: ShoppingCart, roles: ADMIN_ONLY, planned: true },
    ],
  },
  {
    title: "Projects",
    items: [
      { label: "Installations", href: "/modules/installations", icon: Wrench, roles: ADMIN_ONLY, planned: true },
      { label: "Commissioning", href: "/modules/commissioning", icon: Gauge, roles: ADMIN_ONLY, planned: true },
    ],
  },
  {
    title: "Catalog",
    items: [
      { label: "Products", href: "/modules/products", icon: Package, roles: ADMIN_ONLY, planned: true },
      { label: "Serial numbers", href: "/modules/serial-numbers", icon: ScanBarcode, roles: ADMIN_ONLY, planned: true },
    ],
  },
  {
    title: "Service",
    items: [
      { label: "Tickets", href: "/modules/service-tickets", icon: LifeBuoy, roles: ADMIN_ONLY, planned: true },
      { label: "Warranty", href: "/modules/warranty", icon: ShieldCheck, roles: ADMIN_ONLY, planned: true },
      { label: "AMC contracts", href: "/modules/amc", icon: CalendarClock, roles: ADMIN_ONLY, planned: true },
    ],
  },
  {
    title: "Partners",
    items: [{ label: "Dealers", href: "/modules/dealers", icon: Handshake, roles: ADMIN_ONLY, planned: true }],
  },
  {
    title: "Administration",
    items: [
      { label: "Users", href: "/admin/users", icon: Users, roles: ADMIN_ONLY },
      { label: "Reports", href: "/admin/reports", icon: BarChart3, roles: ADMIN_ONLY },
      { label: "Settings", href: "/modules/settings", icon: Settings, roles: ADMIN_ONLY, planned: true },
    ],
  },
];

/** Groups visible to a role, with empty groups removed. */
export function navGroupsForRole(role: Role): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    title: group.title,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}
