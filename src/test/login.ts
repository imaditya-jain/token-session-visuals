import type { LoginInput } from "@/lib/auth-schemas";
import { EmailJob } from "@/server/db/models/email-job";
import { User } from "@/server/db/models/user";
import { completeCustomerOtp, startCustomerLogin } from "@/server/services/admin-auth";
import type { AuthResult, SessionMeta } from "@/server/services/auth";

/**
 * Signs a customer in the way a person does: password, then the code read from the outbox (the email is
 * never delivered in tests). First-step failures propagate unchanged. An existing account is first given the
 * Shopify link the customer-sync job would have made, because sign-in requires it where Shopify is configured.
 */
export async function loginWithCode(input: LoginInput, meta: SessionMeta): Promise<AuthResult> {
  await User.updateOne(
    { email: input.email, shopifyCustomerId: { $exists: false } },
    { $set: { shopifyCustomerId: "gid://shopify/Customer/1" } },
  );
  const issued = await startCustomerLogin(input);
  const job = await EmailJob.findOne({ template: "otp-code", to: input.email })
    .sort({ createdAt: -1 })
    .lean();
  const code = (job?.data as { code?: string } | undefined)?.code;
  if (!code) throw new Error("no sign-in code was queued");
  return completeCustomerOtp(issued.ref, code, meta);
}
