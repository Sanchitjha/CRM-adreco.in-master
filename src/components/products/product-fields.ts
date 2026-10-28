import type { Product } from "@prisma/client";
import type { FieldDef } from "@/components/auto-form";

const num = (v: { toString(): string } | null | undefined): string | undefined => (v == null ? undefined : v.toString());

function withCurrent(values: string[], current: string | null | undefined): string[] {
  return current && !values.includes(current) ? [current, ...values] : values;
}

/** Field list shared by the "new product" and "edit product" forms. */
export function productFields(opts: {
  categories: string[];
  warrantyPeriods: string[];
  product?: Product;
}): FieldDef[] {
  const p = opts.product;
  const categories = withCurrent(opts.categories, p?.category);
  const warranties = withCurrent(opts.warrantyPeriods, p ? String(p.warrantyMonths) : null);

  return [
    { name: "name", label: "Product name", required: true, defaultValue: p?.name, placeholder: "e.g. EVI Heat Pump 30 kW" },
    { name: "modelCode", label: "Model code", required: true, defaultValue: p?.modelCode, placeholder: "Unique model / SKU" },
    {
      kind: "select",
      name: "category",
      label: "Category",
      defaultValue: p?.category,
      options: categories.map((c) => ({ value: c, label: c })),
    },
    {
      name: "series",
      label: "Series",
      defaultValue: p?.series,
      placeholder: "e.g. EVI Series",
      hint: "Variants of the same family share a series.",
    },
    {
      kind: "checkbox",
      name: "isSparePart",
      label: "This is a spare part",
      hint: "Spare parts are counted by quantity in stock and can be used on service tickets.",
      defaultChecked: p?.isSparePart,
      span: 2,
    },
    { name: "heatingCapacityKw", label: "Heating capacity (kW)", kind: "number", step: "0.01", min: 0, defaultValue: num(p?.heatingCapacityKw) },
    { name: "inputPowerKw", label: "Input power (kW)", kind: "number", step: "0.01", min: 0, defaultValue: num(p?.inputPowerKw) },
    { name: "cop", label: "COP", kind: "number", step: "0.01", min: 0, defaultValue: num(p?.cop) },
    { name: "refrigerant", label: "Refrigerant", defaultValue: p?.refrigerant, placeholder: "e.g. R410A" },
    { name: "compressor", label: "Compressor", defaultValue: p?.compressor },
    { name: "heatExchanger", label: "Heat exchanger", defaultValue: p?.heatExchanger, placeholder: "e.g. Titanium shell & tube" },
    { name: "operatingRange", label: "Operating range", defaultValue: p?.operatingRange, placeholder: "e.g. −25°C to 43°C ambient", span: 2 },
    {
      kind: "select",
      name: "warrantyMonths",
      label: "Warranty period",
      defaultValue: p ? String(p.warrantyMonths) : "12",
      options: warranties.map((w) => ({ value: w, label: `${w} months` })),
    },
    { name: "stockQty", label: "Stock on hand", kind: "number", min: 0, defaultValue: p?.stockQty ?? 0, hint: "For spare parts. Machines are counted from their serial numbers." },
    { name: "dealerPrice", label: "Dealer price (₹)", kind: "number", min: 0, step: "0.01", defaultValue: num(p?.dealerPrice) },
    { name: "customerPrice", label: "Customer price (₹)", kind: "number", min: 0, step: "0.01", defaultValue: num(p?.customerPrice) },
    { name: "datasheetUrl", label: "Datasheet / brochure link", kind: "url", defaultValue: p?.datasheetUrl, placeholder: "https://", span: 2 },
    { name: "description", label: "Description", kind: "textarea", defaultValue: p?.description, span: 2 },
  ];
}
