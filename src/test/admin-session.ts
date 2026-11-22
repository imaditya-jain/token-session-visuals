import { NextRequest } from "next/server";

import { hashPassword } from "@/server/auth/password";
import { EmailJob } from "@/server/db/models/email-job";
import { OtpChallenge } from "@/server/db/models/otp-challenge";
import { User } from "@/server/db/models/user";
import { completeAdminLogin, startAdminLogin } from "@/server/services/admin-auth";

export const ADMIN_PASSWORD = "correct horse battery";
const ORIGIN = "http://localhost:3100";

/** Creates an admin with the given role key and signs them in the real way (password, then the emailed code). */
export async function adminSession(
  email: string,
  adminRole: string,
): Promise<{ token: string; userId: string }> {
  await User.create({
    email,
    firstName: "Ada",
    lastName: "Admin",
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    role: adminRole === "super_admin" ? "admin" : "staff",
    adminRole,
  });
  const meta = { ip: "203.0.113.50", userAgent: "vitest" };
  await startAdminLogin({ email, password: ADMIN_PASSWORD }, meta);
  const challenge = await OtpChallenge.findOne({}).sort({ createdAt: -1 }).lean();
  const job = await EmailJob.findOne({ template: "otp-code", to: email })
    .sort({ createdAt: -1 })
    .lean();
  const code = (job?.data as { code: string }).code;
  const result = await completeAdminLogin(challenge?.ref ?? "", code, meta);
  return { token: result.accessToken, userId: result.user.id };
}

type Init = {
  body?: unknown;
  token?: string;
  origin?: string | null;
  headers?: Record<string, string>;
  raw?: BodyInit;
};

/** Builds a request the way a browser on the same origin would send it. */
export function apiRequest(path: string, method: string, init: Init = {}): NextRequest {
  const { body, token, origin = ORIGIN, headers = {}, raw } = init;
  return new NextRequest(`${ORIGIN}${path}`, {
    method,
    headers: {
      "x-forwarded-for": "198.51.100.77",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(origin ? { origin } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(raw !== undefined
      ? { body: raw }
      : body !== undefined
        ? { body: JSON.stringify(body) }
        : {}),
  });
}
