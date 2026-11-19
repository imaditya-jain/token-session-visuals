import "server-only";

import type { z } from "zod";

import { connectDb } from "@/server/db/connection";
import { User } from "@/server/db/models/user";
import { adminQuery } from "@/server/shopify/admin";
import {
  CUSTOMER_BY_EMAIL_QUERY,
  CUSTOMER_CREATE,
  CUSTOMER_UPDATE,
} from "@/server/shopify/customer-queries";
import {
  customerByEmailResponse,
  customerCreateResponse,
  customerUpdateResponse,
} from "@/server/shopify/customer-schemas";

/** Shopify only accepts international (E.164) phone numbers; anything else is left out rather than rejected. */
const toE164 = (phone: string | undefined): string | undefined => {
  const compact = phone?.replace(/[\s()-]/g, "");
  return compact && /^\+[1-9]\d{6,14}$/.test(compact) ? compact : undefined;
};

type UserError = { field: string[] | null; message: string };

const run = async <S extends z.ZodType>(
  schema: S,
  query: string,
  variables: Record<string, unknown>,
): Promise<z.infer<S>> => schema.parse(await adminQuery(query, variables));

async function findByEmail(email: string): Promise<string | null> {
  // Addresses are validated at registration; refuse anything that could break out of the quoted search term.
  if (/["\\]/.test(email)) throw new Error("Unsafe email for customer search");
  const { customers } = await run(customerByEmailResponse, CUSTOMER_BY_EMAIL_QUERY, {
    query: `email:"${email}"`,
  });
  return customers.nodes[0]?.id ?? null;
}

const describe = (errors: UserError[]) =>
  errors.map((e) => `${e.field?.join(".") ?? "base"}: ${e.message}`).join("; ");
const mentionsPhone = (errors: UserError[]) => errors.some((e) => e.field?.includes("phone"));
const isMissing = (errors: UserError[]) =>
  errors.some((e) => /does not exist|not found|invalid id/i.test(e.message));

type Profile = { firstName: string; lastName: string; phone: string | undefined };

/** Updates a customer. Returns "missing" if it was deleted in Shopify so the caller can recreate it. */
async function updateCustomer(id: string, profile: Profile): Promise<"ok" | "missing"> {
  for (const withPhone of [true, false]) {
    const phone = withPhone ? profile.phone : undefined;
    const { customerUpdate } = await run(customerUpdateResponse, CUSTOMER_UPDATE, {
      input: {
        id,
        firstName: profile.firstName,
        lastName: profile.lastName,
        ...(phone ? { phone } : {}),
      },
    });
    if (customerUpdate.userErrors.length === 0) return "ok";
    if (isMissing(customerUpdate.userErrors)) return "missing";
    // A phone number Shopify refuses (or one that belongs to another customer) must not block the rest.
    if (!(withPhone && phone && mentionsPhone(customerUpdate.userErrors)))
      throw new Error(`Shopify customerUpdate: ${describe(customerUpdate.userErrors)}`);
  }
  return "ok";
}

async function createCustomer(email: string, profile: Profile): Promise<string | null> {
  for (const withPhone of [true, false]) {
    const phone = withPhone ? profile.phone : undefined;
    const { customerCreate } = await run(customerCreateResponse, CUSTOMER_CREATE, {
      input: {
        email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        ...(phone ? { phone } : {}),
        tags: ["fernwood-web"],
      },
    });
    if (customerCreate.customer && customerCreate.userErrors.length === 0)
      return customerCreate.customer.id;
    if (customerCreate.userErrors.some((e) => e.field?.includes("email"))) return null; // taken: caller links it
    if (!(withPhone && phone && mentionsPhone(customerCreate.userErrors)))
      throw new Error(`Shopify customerCreate: ${describe(customerCreate.userErrors)}`);
  }
  return null;
}

/**
 * Makes the Shopify customer match the account: links an existing customer with the same email (for example
 * from an earlier guest checkout, so their past orders belong to the account), otherwise creates one, and
 * records the id. Idempotent and safe to repeat; always reads the current account data. Marketing consent is
 * deliberately not touched: the newsletter system owns it.
 */
export async function syncCustomer(userId: string): Promise<void> {
  await connectDb();
  const user = await User.findById(userId).lean();
  if (!user) return; // account deleted after the job was queued
  const profile: Profile = {
    firstName: user.firstName,
    lastName: user.lastName,
    phone: toE164(user.phone),
  };

  if (user.shopifyCustomerId && (await updateCustomer(user.shopifyCustomerId, profile)) === "ok")
    return;

  let id = await findByEmail(user.email);
  if (id) {
    if ((await updateCustomer(id, profile)) === "missing") id = null;
  }
  if (!id) {
    id = (await createCustomer(user.email, profile)) ?? (await findByEmail(user.email));
    if (!id) throw new Error("Shopify customer could neither be created nor found");
  }
  await User.updateOne({ _id: user._id }, { $set: { shopifyCustomerId: id } });
}
