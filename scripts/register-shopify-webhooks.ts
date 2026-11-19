/**
 * Registers the Shopify webhooks the storefront relies on (cache revalidation + the GID mirror of products,
 * collections and orders). Idempotent: topics that already point at the URL are left alone.
 *
 *   node --env-file=.env scripts/register-shopify-webhooks.ts --url https://your-domain.com            # dry run
 *   node --env-file=.env scripts/register-shopify-webhooks.ts --url https://your-domain.com --apply    # create
 *
 * The signing secret Shopify uses for these webhooks is the app's secret: it must equal SHOPIFY_WEBHOOK_SECRET on
 * the server that receives them. Only https URLs are accepted.
 */
const API_VERSION = "2025-10";
const apply = process.argv.includes("--apply");
const urlFlag = process.argv.indexOf("--url");
const base = urlFlag >= 0 ? process.argv[urlFlag + 1] : undefined;

const TOPICS = [
  "PRODUCTS_CREATE",
  "PRODUCTS_UPDATE",
  "PRODUCTS_DELETE",
  "COLLECTIONS_CREATE",
  "COLLECTIONS_UPDATE",
  "COLLECTIONS_DELETE",
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_PAID",
  "ORDERS_CANCELLED",
  "ORDERS_FULFILLED",
  "ORDERS_PARTIALLY_FULFILLED",
  "ORDERS_EDITED",
  "ORDERS_DELETE",
  "INVENTORY_LEVELS_UPDATE",
] as const;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!base) fail("Missing --url https://your-domain.com");
let callbackUrl: string;
try {
  const parsed = new URL(base);
  if (parsed.protocol !== "https:") fail("The webhook URL must use https.");
  callbackUrl = `${parsed.origin}/api/webhooks/shopify`;
} catch {
  fail(`Not a valid URL: ${base}`);
}

const store = (process.env["SHOPIFY_STORE_URL"] ?? "")
  .replace(/^https?:\/\//, "")
  .replace(/\/$/, "");
const token = process.env["SHOPIFY_ADMIN_API_ACCESS_TOKEN"];
if (!store || !token)
  fail("SHOPIFY_STORE_URL and SHOPIFY_ADMIN_API_ACCESS_TOKEN must be set (use --env-file=.env).");

async function admin<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`https://${store}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token as string },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) fail(`Shopify responded ${response.status}`);
  const body = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) fail(body.errors.map((e) => e.message).join("; "));
  return body.data as T;
}

type Existing = {
  webhookSubscriptions: {
    nodes: { id: string; topic: string; endpoint: { callbackUrl?: string } }[];
  };
};

const existing = await admin<Existing>(`{
  webhookSubscriptions(first: 100) {
    nodes { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } }
  }
}`);

const have = new Set(
  existing.webhookSubscriptions.nodes
    .filter((node) => node.endpoint.callbackUrl === callbackUrl)
    .map((node) => node.topic),
);
const missing = TOPICS.filter((topic) => !have.has(topic));

console.log(`Store: ${store}`);
console.log(`Callback: ${callbackUrl}`);
console.log(`Already registered: ${have.size}, missing: ${missing.length}`);
for (const topic of missing) console.log(`  ${apply ? "creating" : "would create"} ${topic}`);

if (apply) {
  for (const topic of missing) {
    const result = await admin<{
      webhookSubscriptionCreate: { userErrors: { message: string }[] };
    }>(
      `mutation($topic: WebhookSubscriptionTopic!, $url: URL!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $url, format: JSON }) {
          userErrors { message }
        }
      }`,
      { topic, url: callbackUrl },
    );
    const errors = result.webhookSubscriptionCreate.userErrors;
    if (errors.length) fail(`${topic}: ${errors.map((e) => e.message).join("; ")}`);
  }
  console.log("Done.");
} else if (missing.length > 0) {
  console.log("Dry run only. Re-run with --apply to create them.");
}
