import { z } from "zod";

/** Rules every password must meet, wherever it is set: a new user, an admin reset or a self-service change. */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  // bcrypt only reads the first 72 bytes, so a longer password would give a false sense of strength.
  .max(72, "Password must be at most 72 characters")
  .regex(/[A-Za-z]/, "Password must include a letter")
  .regex(/\d/, "Password must include a number");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The new passwords do not match",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password different from the current one",
  });
