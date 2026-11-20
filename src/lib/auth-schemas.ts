import { z } from "zod";

import { configureZodForBrowser } from "@/lib/zod-browser";

configureZodForBrowser();

/** Shared by the API (authoritative) and the forms (instant feedback). */
const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(254));
const name = z.string().trim().min(1, "Required").max(80);

// Length beats composition rules (NIST 800-63B); the ceiling prevents hashing-DoS.
export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Use at most 128 characters");

export const registerSchema = z.object({
  email,
  password: passwordSchema,
  firstName: name,
  lastName: name,
  acceptsMarketing: z.boolean().default(false),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Required").max(128),
});

export const profileSchema = z
  .object({
    firstName: name,
    lastName: name,
    phone: z
      .string()
      .trim()
      .regex(/^[+()\d\s-]{6,32}$/, "Enter a valid phone number")
      .or(z.literal("")),
    acceptsMarketing: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProfileInput = z.infer<typeof profileSchema>;

const oneTimeToken = z.string().trim().min(20, "Invalid link").max(200, "Invalid link");

export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: oneTimeToken, password: passwordSchema });
export const confirmTokenSchema = z.object({ token: oneTimeToken });

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
