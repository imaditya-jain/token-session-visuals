import { z } from "zod";

import { loginSchema } from "@/lib/auth-schemas";
import { permissionSchema, roleKeySchema } from "@/lib/permissions";
import { configureZodForBrowser } from "@/lib/zod-browser";

configureZodForBrowser();

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address").max(254));

export const adminLoginSchema = loginSchema;

const challenge = z.string().min(16, "Invalid request").max(64, "Invalid request");

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code");

export const otpVerifySchema = z.object({ challenge, code: otpCodeSchema });
export const otpResendSchema = z.object({ challenge });
export const customerOtpRequestSchema = z.object({ email });

export const inviteAdminSchema = z.object({
  email,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  roleKey: roleKeySchema,
});

export const updateAdminUserSchema = z
  .object({ roleKey: roleKeySchema.nullable(), disabled: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const createRoleSchema = z.object({
  key: roleKeySchema,
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(300).default(""),
  permissions: z.array(permissionSchema).max(50),
});

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(300),
    permissions: z.array(permissionSchema).max(50),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.iso.datetime().optional(),
});
