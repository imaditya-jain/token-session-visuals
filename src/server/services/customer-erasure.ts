import "server-only";

import { z } from "zod";

import { adminQuery } from "@/server/shopify/admin";

const MUTATION = /* GraphQL */ `
  mutation CustomerRequestDataErasure($customerId: ID!) {
    customerRequestDataErasure(customerId: $customerId) {
      customerId
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const response = z.object({
  customerRequestDataErasure: z.object({
    customerId: z.string().nullable(),
    userErrors: z.array(
      z.object({
        field: z.array(z.string()).nullable(),
        message: z.string(),
        code: z.string().nullable(),
      }),
    ),
  }),
});

/**
 * Asks Shopify to erase a customer's personal data (their GDPR/CCPA erasure mechanism). Shopify performs it after a
 * grace period, and keeps data it is legally obliged to (recent orders).
 *
 * A customer that no longer exists (code `DOES_NOT_EXIST`) is success: the goal state is already reached. Verified
 * against a real store: asking twice for the same customer answers `FAILED_TO_REQUEST` with no further detail, so
 * that outcome is NOT silently accepted. It is raised with an explanation, and the job outbox retries it and then
 * reports it, so a person can check the customer in Shopify admin (Customers > the customer > privacy).
 */
export async function requestCustomerErasure(customerGid: string): Promise<void> {
  const { customerRequestDataErasure } = response.parse(
    await adminQuery(MUTATION, { customerId: customerGid }),
  );
  const real = customerRequestDataErasure.userErrors.filter(
    (error) =>
      error.code !== "DOES_NOT_EXIST" &&
      !/already|does not exist|not found|invalid id/i.test(error.message),
  );
  if (real.length === 0) return;
  const hint = real.some((error) => error.code === "FAILED_TO_REQUEST")
    ? " (Shopify gives no detail; this usually means an erasure is already pending for this customer. Check the customer in Shopify admin.)"
    : "";
  throw new Error(
    `Shopify customerRequestDataErasure: ${real.map((e) => `${e.code ?? "error"}: ${e.message}`).join("; ")}${hint}`,
  );
}
