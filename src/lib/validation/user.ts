import { z } from "zod";

export const ROLE_VALUES = ["ADMIN", "SALES", "DESIGN", "ACCOUNTS", "INSTALLATION", "SERVICE"] as const;

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(ROLE_VALUES),
});
