import "server-only";

import { verifyPassword } from "@/server/auth/password";
import { connectDb } from "@/server/db/connection";
import { AuthToken } from "@/server/db/models/auth-token";
import { Notification } from "@/server/db/models/notification";
import { PlantDiagnosis } from "@/server/db/models/plant-diagnosis";
import { PushDevice } from "@/server/db/models/push-device";
import { ShopifyOrder } from "@/server/db/models/shopify-mirror";
import { Subscriber } from "@/server/db/models/subscriber";
import { User } from "@/server/db/models/user";
import { eraseUserReels } from "@/server/services/reels";
import { Wishlist } from "@/server/db/models/wishlist";
import { enqueueEmail } from "@/server/email/outbox";
import { forbidden, unauthorized } from "@/server/http/errors";
import { logger } from "@/server/logger";
import { enqueueCustomerErasure } from "@/server/queue/producers";

export const EXPORT_SCHEMA_VERSION = 1;

/**
 * Everything we hold about the signed-in person, in a portable format (GDPR art. 15/20, CCPA right to know).
 * Credentials and internal hashes are never included. Order details and addresses live in Shopify, our commerce
 * provider, so the file says so instead of pretending to be complete.
 */
export async function exportAccountData(userId: string) {
  await connectDb();
  // `sessions` is hidden by default (it holds token hashes); the export lists devices but never the hashes.
  const user = await User.findById(userId).select("+sessions").lean();
  if (!user) throw unauthorized("Account not found", "session_revoked");

  const [subscriber, orders] = await Promise.all([
    Subscriber.findOne({ email: user.email }).lean(),
    ShopifyOrder.find({ userId: user._id }).sort({ processedAt: -1 }).lean(),
  ]);

  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    account: {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? null,
      acceptsMarketing: user.acceptsMarketing,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      shopifyCustomerId: user.shopifyCustomerId ?? null,
    },
    signedInDevices: user.sessions.map((session) => ({
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      userAgent: session.userAgent ?? null,
      ipAddress: session.ip ?? null,
    })),
    newsletter: subscriber
      ? {
          status: subscriber.status,
          source: subscriber.source,
          consentAt: subscriber.consentAt.toISOString(),
          confirmedAt: subscriber.confirmedAt?.toISOString() ?? null,
          unsubscribedAt: subscriber.unsubscribedAt?.toISOString() ?? null,
        }
      : null,
    orders: orders.map((order) => ({
      shopifyId: order.gid,
      name: order.name,
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      processedAt: order.processedAt?.toISOString() ?? null,
      cancelledAt: order.cancelledAt?.toISOString() ?? null,
      currency: order.currency,
      total: order.total,
      items: order.lineItems.map((line) => ({ title: line.title, quantity: line.quantity })),
    })),
    notes: [
      "Order contents, shipping addresses and payment records are held by Shopify, our commerce provider. Contact us if you need a copy of those.",
      "Security data such as password hashes and session tokens is deliberately not part of this file.",
    ],
  };
}

/**
 * Permanently deletes the account after re-checking the password.
 *
 * Order matters. Steps 1-3 are idempotent and can simply be repeated by the person if something fails, because the
 * account still exists. Deleting the account (step 4) is the point of no return: from then on every session is
 * invalid at once (sessions live on the account). Step 5 queues the follow-ups through the outbox.
 *
 *   1. mailing list entry removed (no further marketing, no leftover consent record)
 *   2. orders detached from the person (kept as anonymous financial records: we must retain them)
 *   3. one-time tokens removed
 *   4. the account itself
 *   5. Shopify customer erasure + confirmation email queued
 */
export async function deleteAccount(userId: string, password: string): Promise<void> {
  await connectDb();
  const user = await User.findById(userId).select("+passwordHash").lean();
  if (!user) throw unauthorized("Account not found", "session_revoked");

  if (!(await verifyPassword(user.passwordHash, password)))
    throw forbidden("That password is incorrect.", "invalid_password");

  await Subscriber.deleteOne({ email: user.email });
  await ShopifyOrder.updateMany(
    { userId: user._id },
    { $unset: { userId: 1, emailKey: 1, customerGid: 1 } },
  );
  await AuthToken.deleteMany({ userId: user._id });
  // Everything else we keep about this person goes with the account.
  await Promise.all([
    Wishlist.deleteMany({ userId: user._id }),
    PushDevice.deleteMany({ userId: user._id }),
    Notification.deleteMany({ userId: user._id }),
    PlantDiagnosis.deleteMany({ userId: user._id }),
    eraseUserReels(userId),
  ]);
  await User.deleteOne({ _id: user._id });

  logger.info({ userId }, "Account deleted at the owner's request");

  if (user.shopifyCustomerId) await enqueueCustomerErasure(user.shopifyCustomerId);
  await enqueueEmail("account-deleted", user.email, { firstName: user.firstName }).catch(
    (error: unknown) =>
      logger.error({ err: error, userId }, "Could not queue the account-deleted confirmation"),
  );
}
