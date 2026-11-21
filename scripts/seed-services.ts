/**
 * Idempotent seeder for the gardener service product (dev store).
 *
 *   node --env-file=.env scripts/seed-services.ts           # dry run (default, no writes)
 *   node --env-file=.env scripts/seed-services.ts --apply   # write; refuses non-development stores
 *
 * Creates ONE draft product, "Garden Care Visit" ($60, no shipping, no inventory). The one-time purchase is the
 * product itself; the Monthly / Fortnightly / Weekly subscription plans are Seal Subscriptions rules attached to
 * this product in the Seal app (they are not created here). The price is a placeholder the owner can change in
 * Shopify. The product stays a DRAFT until the owner publishes it.
 */
const API_VERSION = "2025-10";
const apply = process.argv.includes("--apply");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

const host = requireEnv("SHOPIFY_STORE_URL")
  .replace(/^https?:\/\//, "")
  .replace(/\/.*$/, "");
const adminToken = requireEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN");

type UserError = { field?: string[] | null; message: string };

async function admin<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`https://${host}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": adminToken },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as { data?: T; errors?: unknown };
  if (!response.ok || body.errors || !body.data) {
    throw new Error(`Admin API error: ${JSON.stringify(body.errors ?? response.status)}`);
  }
  return body.data;
}

const SERVICE = {
  handle: "garden-care-visit",
  title: "Garden Care Visit",
  price: "60.00",
  descriptionHtml:
    "<p>A visit from a Fernwood gardener to look after your plants and garden. Book a single visit, or subscribe to have a gardener come back monthly, fortnightly or weekly.</p>",
};

async function main() {
  const { shop } = await admin<{ shop: { name: string; plan: { partnerDevelopment: boolean } } }>(
    `{ shop { name plan { partnerDevelopment } } }`,
  );
  console.log(`Store: ${shop.name} (development: ${shop.plan.partnerDevelopment})`);
  if (apply && !shop.plan.partnerDevelopment && process.env["SHOPIFY_ALLOW_WRITE"] !== "1") {
    throw new Error("Refusing to write to a non-development store (set SHOPIFY_ALLOW_WRITE=1 to override).");
  }
  console.log(`${apply ? "[apply]" : "[dry-run]"} productSet ${SERVICE.handle} (DRAFT, $${SERVICE.price}, no shipping)`);
  if (!apply) return;

  const result = await admin<{
    productSet: { product: { id: string; status: string } | null; userErrors: UserError[] };
  }>(
    `mutation($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
      productSet(synchronous: true, input: $input, identifier: $identifier) {
        product { id status }
        userErrors { field message }
      }
    }`,
    {
      identifier: { handle: SERVICE.handle },
      input: {
        handle: SERVICE.handle,
        title: SERVICE.title,
        status: "DRAFT",
        productType: "Service",
        descriptionHtml: SERVICE.descriptionHtml,
        productOptions: [{ name: "Title", position: 1, values: [{ name: "Default Title" }] }],
        variants: [
          {
            optionValues: [{ optionName: "Title", name: "Default Title" }],
            price: SERVICE.price,
            inventoryItem: { requiresShipping: false, tracked: false },
          },
        ],
      },
    },
  );
  const { product, userErrors } = result.productSet;
  if (userErrors.length) throw new Error(userErrors.map((e) => e.message).join("; "));
  console.log(`Product ${product?.id} is ${product?.status}`);
}

await main();
