import "server-only";

import type { z } from "zod";

import { connectDb } from "@/server/db/connection";
import { Subscriber } from "@/server/db/models/subscriber";
import { adminQuery } from "@/server/shopify/admin";
import { CUSTOMER_MARKETING_UPDATE } from "@/server/shopify/customer-queries";
import { customerMarketingResponse } from "@/server/shopify/customer-schemas";
import { findByEmail } from "@/server/services/customer-sync";

const run = async <S extends z.ZodType>(
  schema: S,
  query: string,
  variables: Record<string, unknown>,
): Promise<z.infer<S>> => schema.parse(await adminQuery(query, variables));

/**
 * Writes the mailing list's decision for one address onto its Shopify customer. The mailing list is the source
 * of truth and only ever holds an address after its owner proved the mailbox (double opt-in link, one-click
 * unsubscribe token, or a verified account), so this never lets a stranger change someone else's consent.
 * A pending subscriber has not consented yet and is left alone. No customer yet means nothing to do: the
 * customer sync queues this again once one exists.
 */
export async function syncMarketingConsentToShopify(subscriberId: string): Promise<void> {
  await connectDb();
  const subscriber = await Subscriber.findById(subscriberId).lean();
  if (!subscriber || subscriber.status === "pending") return;
  const customerId = await findByEmail(subscriber.email);
  if (!customerId) return;

  const subscribed = subscriber.status === "subscribed";
  const { customerEmailMarketingConsentUpdate: result } = await run(
    customerMarketingResponse,
    CUSTOMER_MARKETING_UPDATE,
    {
      input: {
        customerId,
        emailMarketingConsent: {
          marketingState: subscribed ? "SUBSCRIBED" : "UNSUBSCRIBED",
          // The link click is the double opt-in; accounts consent in the registration form with a verified mailbox.
          ...(subscribed
            ? {
                marketingOptInLevel:
                  subscriber.source === "account" ? "SINGLE_OPT_IN" : "CONFIRMED_OPT_IN",
              }
            : {}),
          consentUpdatedAt:
            (subscribed ? subscriber.confirmedAt : subscriber.unsubscribedAt)?.toISOString() ??
            new Date().toISOString(),
        },
      },
    },
  );
  if (result.userErrors.length)
    throw new Error(
      `Shopify marketing consent: ${result.userErrors.map((e) => e.message).join("; ")}`,
    );
}
