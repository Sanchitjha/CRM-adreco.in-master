import { z } from "zod";
import { optionalDateString, optionalMoney, optionalText } from "@/lib/validation/common";

export const ORDER_STATUS_VALUES = ["CONFIRMED", "IN_PRODUCTION", "DISPATCHED", "DELIVERED", "CANCELLED"] as const;

export const convertQuotationSchema = z.object({ quotationId: z.string().min(1) });

export const updateOrderDetailsSchema = z.object({
  orderId: z.string().min(1),
  deliveryDate: optionalDateString,
  paymentTerms: optionalText,
  customerPoNumber: optionalText,
  billingAddress: optionalText,
  shippingAddress: optionalText,
  amountReceived: optionalMoney,
  notes: optionalText,
});

export const updateDispatchSchema = z.object({
  orderId: z.string().min(1),
  transporter: optionalText,
  lrNumber: optionalText,
  ewayBillNo: optionalText,
});

export const updateOrderStatusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(ORDER_STATUS_VALUES),
});

export const attachSerialsSchema = z.object({
  orderId: z.string().min(1),
  serials: z.string().trim().min(1, "Enter at least one serial number"),
});

export const detachSerialSchema = z.object({ orderId: z.string().min(1), serialId: z.string().min(1) });
