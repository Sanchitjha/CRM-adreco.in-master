import type { Role } from "@prisma/client";
import { MODULE_ACCESS } from "@/lib/rbac";
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
  MessagesSquare,
  Eye,
  UsersRound,
  Database,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  roles: Role[];
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
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard, roles: ALL_ROLES },
      { label: "Team chat", href: "/chat", icon: MessagesSquare, roles: ALL_ROLES },
    ],
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
      { label: "Sales orders", href: "/sales-orders", icon: ShoppingCart, roles: MODULE_ACCESS.salesOrders.view },
    ],
  },
  {
    title: "Projects",
    items: [
      { label: "Installations", href: "/installations", icon: Wrench, roles: MODULE_ACCESS.installations.view },
      { label: "Commissioning", href: "/commissioning", icon: Gauge, roles: MODULE_ACCESS.commissioning.view },
    ],
  },
  {
    title: "Catalog",
    items: [
      { label: "Products", href: "/products", icon: Package, roles: MODULE_ACCESS.products.view },
      { label: "Serial numbers", href: "/serial-numbers", icon: ScanBarcode, roles: MODULE_ACCESS.serials.view },
    ],
  },
  {
    title: "Service",
    items: [
      { label: "Tickets", href: "/tickets", icon: LifeBuoy, roles: MODULE_ACCESS.tickets.view },
      { label: "Warranty", href: "/warranty", icon: ShieldCheck, roles: MODULE_ACCESS.warranty.view },
      { label: "AMC contracts", href: "/amc", icon: CalendarClock, roles: MODULE_ACCESS.amc.view },
    ],
  },
  {
    title: "Partners",
    items: [{ label: "Dealers", href: "/dealers", icon: Handshake, roles: MODULE_ACCESS.dealers.view }],
  },
  {
    title: "Administration",
    items: [
      { label: "Users", href: "/admin/users", icon: Users, roles: ADMIN_ONLY },
      { label: "Data import", href: "/admin/data", icon: Database, roles: ADMIN_ONLY },
      { label: "Reports", href: "/admin/reports", icon: BarChart3, roles: ADMIN_ONLY },
      { label: "Team activity", href: "/admin/team", icon: UsersRound, roles: ADMIN_ONLY },
      { label: "All chats", href: "/admin/chats", icon: Eye, roles: ADMIN_ONLY },
      { label: "Settings", href: "/settings", icon: Settings, roles: MODULE_ACCESS.settings.view },
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
