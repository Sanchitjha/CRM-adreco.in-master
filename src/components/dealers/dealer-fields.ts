import type { Dealer } from "@prisma/client";
import type { FieldDef } from "@/components/auto-form";

/** Field list shared by the "new dealer" and "edit dealer" forms. */
export function dealerFields(opts: { territories: string[]; dealer?: Dealer }): FieldDef[] {
  const d = opts.dealer;
  const territories = d?.territory && !opts.territories.includes(d.territory) ? [d.territory, ...opts.territories] : opts.territories;

  return [
    { name: "name", label: "Dealer name", required: true, defaultValue: d?.name },
    { name: "code", label: "Dealer code", defaultValue: d?.code, hint: "Optional short code, unique to this dealer." },
    { name: "contactPerson", label: "Contact person", defaultValue: d?.contactPerson },
    { name: "phone", label: "Phone", kind: "tel", defaultValue: d?.phone },
    { name: "email", label: "Email", kind: "email", defaultValue: d?.email },
    { name: "gstin", label: "GSTIN", defaultValue: d?.gstin, placeholder: "15-character GST number" },
    { name: "address", label: "Address", kind: "textarea", rows: 2, defaultValue: d?.address, span: 2 },
    { name: "city", label: "City", defaultValue: d?.city },
    { name: "state", label: "State", defaultValue: d?.state },
    {
      kind: "select",
      name: "territory",
      label: "Territory",
      placeholder: "Select…",
      defaultValue: d?.territory,
      options: territories.map((t) => ({ value: t, label: t })),
      span: 2,
    },
    { name: "notes", label: "Notes", kind: "textarea", rows: 2, defaultValue: d?.notes, span: 2 },
  ];
}
