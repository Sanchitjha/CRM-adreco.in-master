import { z } from "zod";
import { optionalInt, optionalMoney, optionalNumber, optionalText } from "@/lib/validation/common";

const optionalUrl = z.union([z.string().trim().url("Datasheet link must start with http:// or https://"), z.literal("")]).optional();

export const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  modelCode: z.string().trim().min(1, "Model code is required"),
  category: optionalText,
  series: optionalText,
  description: optionalText,
  isSparePart: z.string().optional(),
  heatingCapacityKw: optionalNumber,
  inputPowerKw: optionalNumber,
  cop: optionalNumber,
  refrigerant: optionalText,
  compressor: optionalText,
  operatingRange: optionalText,
  heatExchanger: optionalText,
  warrantyMonths: optionalInt,
  dealerPrice: optionalMoney,
  customerPrice: optionalMoney,
  stockQty: optionalInt,
  datasheetUrl: optionalUrl,
});

export const updateProductSchema = productSchema.extend({ productId: z.string().min(1) });

export const productIdSchema = z.object({ productId: z.string().min(1) });

export const adjustStockSchema = z.object({
  productId: z.string().min(1),
  delta: z.coerce
    .number({ error: "Enter the quantity to add or remove" })
    .int("Enter a whole number")
    .refine((n) => n !== 0, "Enter a quantity to add or remove"),
  note: optionalText,
});
