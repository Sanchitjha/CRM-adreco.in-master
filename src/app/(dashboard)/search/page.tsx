import Link from "next/link";
import {
  CalendarClock,
  Contact,
  FileText,
  Handshake,
  LifeBuoy,
  Package,
  ScanBarcode,
  Search,
  ShieldCheck,
  ShoppingCart,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { canAccessQuotations, canView } from "@/lib/rbac";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/utils";
import { CLAIM_STATUS, INSTALLATION_STATUS, ORDER_STATUS, SERIAL_STATUS, TICKET_STATUS } from "@/lib/statuses";
import { STATUS_LABELS } from "@/components/status-badge";
import { EmptyState, PageHeader, SectionCard } from "@/components/ui";

const PER_GROUP = 6;
const MIN_TERM = 2;

type Hit = { id: string; title: string; subtitle: string; href: string };
type Group = { key: string; title: string; icon: LucideIcon; hits: Hit[] };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const term = (q ?? "").trim();
  const session = await auth();
  const { role, id: userId } = session!.user;

  const groups = term.length >= MIN_TERM ? await search(term, role, userId) : [];
  const total = groups.reduce((n, g) => n + g.hits.length, 0);

  return (
    <div className="space-y-6">
      <PageHeader icon={Search} title="Search" description="Customers, quotations, orders, serial numbers, tickets and more." />

      <form action="/search" method="get" className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          name="q"
          defaultValue={term}
          type="search"
          autoFocus={term === ""}
          placeholder="Name, phone, quote or order number, serial number…"
          aria-label="Search"
          className="input pl-9"
        />
      </form>

      {term.length < MIN_TERM ? (
        <p className="text-sm text-slate-500">Type at least {MIN_TERM} characters to search.</p>
      ) : total === 0 ? (
        <SectionCard title={`No results for “${term}”`} icon={Search}>
          <EmptyState icon={Search} title="Nothing matched" description="Check the spelling, or try part of a phone number or document number." />
        </SectionCard>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {groups
            .filter((g) => g.hits.length > 0)
            .map((g) => (
              <SectionCard key={g.key} title={g.title} description={`${g.hits.length} shown`} icon={g.icon} bodyClassName="p-0">
                <ul className="divide-y divide-[var(--border)]">
                  {g.hits.map((h) => (
                    <li key={h.id}>
                      <Link href={h.href} className="block px-5 py-3 transition hover:bg-slate-50/70">
                        <p className="truncate text-sm font-medium text-slate-800">{h.title}</p>
                        <p className="truncate text-xs text-slate-500">{h.subtitle}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            ))}
        </div>
      )}
    </div>
  );
}

async function search(term: string, role: Parameters<typeof canView>[0], userId: string): Promise<Group[]> {
  const like = { contains: term, mode: "insensitive" as const };
  // Sales reps only see records tied to leads assigned to them; every other role works across all customers.
  const ownLead = role === "SALES" ? { lead: { assignedToId: userId } } : {};
  const canOpenLeads = role === "ADMIN" || role === "SALES";

  const jobs: Promise<Group | null>[] = [];
  const add = (allowed: boolean, make: () => Promise<Group>) => {
    if (allowed) jobs.push(make());
  };

  add(canOpenLeads, async () => {
    const rows = await prisma.lead.findMany({
      where: {
        AND: [
          role === "SALES" ? { assignedToId: userId } : {},
          {
            OR: [
              { customerName: like },
              { phone: { contains: term } },
              { email: like },
              { address: like },
              { contacts: { some: { OR: [{ name: like }, { phone: { contains: term } }] } } },
            ],
          },
        ],
      },
      select: { id: true, customerName: true, phone: true, status: true },
      orderBy: { createdAt: "desc" },
      take: PER_GROUP,
    });
    return {
      key: "leads",
      title: "Leads",
      icon: Contact,
      hits: rows.map((l) => ({ id: l.id, title: l.customerName, subtitle: `${l.phone} · ${STATUS_LABELS[l.status]}`, href: `/leads/${l.id}` })),
    };
  });

  add(canAccessQuotations(role), async () => {
    const rows = await prisma.quotation.findMany({
      where: { AND: [ownLead, { OR: [{ quoteNumber: like }, { lead: { customerName: like } }] }] },
      select: { id: true, quoteNumber: true, grandTotal: true, lead: { select: { customerName: true } } },
      orderBy: { createdAt: "desc" },
      take: PER_GROUP,
    });
    return {
      key: "quotations",
      title: "Quotations",
      icon: FileText,
      hits: rows.map((r) => ({ id: r.id, title: r.quoteNumber, subtitle: `${r.lead.customerName} · ${formatINR(Number(r.grandTotal))}`, href: `/quotations/${r.id}` })),
    };
  });

  add(canView(role, "salesOrders"), async () => {
    const rows = await prisma.salesOrder.findMany({
      where: { AND: [ownLead, { OR: [{ orderNumber: like }, { customerPoNumber: like }, { lead: { customerName: like } }] }] },
      select: { id: true, orderNumber: true, status: true, lead: { select: { customerName: true } } },
      orderBy: { createdAt: "desc" },
      take: PER_GROUP,
    });
    return {
      key: "orders",
      title: "Sales orders",
      icon: ShoppingCart,
      hits: rows.map((r) => ({ id: r.id, title: r.orderNumber, subtitle: `${r.lead.customerName} · ${ORDER_STATUS[r.status].label}`, href: `/sales-orders/${r.id}` })),
    };
  });

  add(canView(role, "installations"), async () => {
    const rows = await prisma.installation.findMany({
      where: { AND: [ownLead, { OR: [{ jobNumber: like }, { lead: { customerName: like } }] }] },
      select: { id: true, jobNumber: true, status: true, lead: { select: { customerName: true } } },
      orderBy: { createdAt: "desc" },
      take: PER_GROUP,
    });
    return {
      key: "installations",
      title: "Installations",
      icon: Wrench,
      hits: rows.map((r) => ({ id: r.id, title: r.jobNumber, subtitle: `${r.lead.customerName} · ${INSTALLATION_STATUS[r.status].label}`, href: `/installations/${r.id}` })),
    };
  });

  add(canView(role, "serials"), async () => {
    const rows = await prisma.serialNumber.findMany({
      where: {
        AND: [
          ownLead,
          { OR: [{ serialNo: like }, { product: { name: like } }, { product: { modelCode: like } }, { lead: { customerName: like } }] },
        ],
      },
      select: {
        id: true,
        serialNo: true,
        status: true,
        product: { select: { name: true } },
        lead: { select: { customerName: true } },
      },
      orderBy: { serialNo: "asc" },
      take: PER_GROUP,
    });
    return {
      key: "serials",
      title: "Serial numbers",
      icon: ScanBarcode,
      hits: rows.map((r) => ({
        id: r.id,
        title: r.serialNo,
        subtitle: [r.product.name, r.lead?.customerName, SERIAL_STATUS[r.status].label].filter(Boolean).join(" · "),
        href: `/serial-numbers/${r.id}`,
      })),
    };
  });

  add(canView(role, "tickets"), async () => {
    const rows = await prisma.serviceTicket.findMany({
      where: { AND: [ownLead, { OR: [{ ticketNumber: like }, { subject: like }, { lead: { customerName: like } }] }] },
      select: { id: true, ticketNumber: true, subject: true, status: true, lead: { select: { customerName: true } } },
      orderBy: { createdAt: "desc" },
      take: PER_GROUP,
    });
    return {
      key: "tickets",
      title: "Service tickets",
      icon: LifeBuoy,
      hits: rows.map((r) => ({ id: r.id, title: `${r.ticketNumber} · ${r.subject}`, subtitle: `${r.lead.customerName} · ${TICKET_STATUS[r.status].label}`, href: `/tickets/${r.id}` })),
    };
  });

  add(canView(role, "warranty"), async () => {
    const rows = await prisma.warrantyClaim.findMany({
      where: {
        AND: [
          role === "SALES" ? { serialNumber: { lead: { assignedToId: userId } } } : {},
          { OR: [{ claimNumber: like }, { issue: like }, { serialNumber: { serialNo: like } }] },
        ],
      },
      select: { id: true, claimNumber: true, status: true, serialNumber: { select: { serialNo: true } } },
      orderBy: { createdAt: "desc" },
      take: PER_GROUP,
    });
    return {
      key: "claims",
      title: "Warranty claims",
      icon: ShieldCheck,
      hits: rows.map((r) => ({ id: r.id, title: r.claimNumber, subtitle: `${r.serialNumber.serialNo} · ${CLAIM_STATUS[r.status].label}`, href: `/warranty/claims/${r.id}` })),
    };
  });

  add(canView(role, "amc"), async () => {
    const rows = await prisma.amcContract.findMany({
      where: { AND: [ownLead, { OR: [{ contractNumber: like }, { lead: { customerName: like } }] }] },
      select: { id: true, contractNumber: true, endDate: true, lead: { select: { customerName: true } } },
      orderBy: { createdAt: "desc" },
      take: PER_GROUP,
    });
    return {
      key: "amc",
      title: "AMC contracts",
      icon: CalendarClock,
      hits: rows.map((r) => ({ id: r.id, title: r.contractNumber, subtitle: `${r.lead.customerName} · ends ${formatDate(r.endDate)}`, href: `/amc/${r.id}` })),
    };
  });

  add(canView(role, "products"), async () => {
    const rows = await prisma.product.findMany({
      where: { OR: [{ name: like }, { modelCode: like }, { series: like }] },
      select: { id: true, name: true, modelCode: true, isSparePart: true },
      orderBy: { name: "asc" },
      take: PER_GROUP,
    });
    return {
      key: "products",
      title: "Products",
      icon: Package,
      hits: rows.map((r) => ({ id: r.id, title: r.name, subtitle: `${r.modelCode}${r.isSparePart ? " · spare part" : ""}`, href: `/products/${r.id}` })),
    };
  });

  add(canView(role, "dealers"), async () => {
    const rows = await prisma.dealer.findMany({
      where: { OR: [{ name: like }, { code: like }, { contactPerson: like }, { city: like }, { phone: { contains: term } }] },
      select: { id: true, name: true, code: true, city: true },
      orderBy: { name: "asc" },
      take: PER_GROUP,
    });
    return {
      key: "dealers",
      title: "Dealers",
      icon: Handshake,
      hits: rows.map((r) => ({ id: r.id, title: r.name, subtitle: [r.code, r.city].filter(Boolean).join(" · ") || "Dealer", href: `/dealers/${r.id}` })),
    };
  });

  return (await Promise.all(jobs)).filter((g): g is Group => g !== null);
}
