import { z } from "zod";
import { passwordSchema } from "@/lib/password-policy";

export const ROLE_VALUES = ["ADMIN", "SALES", "DESIGN", "ACCOUNTS", "INSTALLATION", "SERVICE"] as const;

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: passwordSchema,
  role: z.enum(ROLE_VALUES),
});
