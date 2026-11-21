/**
 * Applies the Fernwood palette to Shopify's hosted checkout, thank-you and order status pages (dev store).
 *
 *   node --env-file=.env scripts/configure-checkout-branding.ts           # dry run (default, no writes)
 *   node --env-file=.env scripts/configure-checkout-branding.ts --apply   # write; refuses non-development stores
 *
 * Colours are the locked design tokens as hex (same values as src/server/email/templates/brand.ts). Checkout
 * branding needs checkout extensibility (Shopify Plus). Idempotent: upserting the same values changes nothing.
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

const palette = {
  cream: "#faf3e5",
  card: "#fdfaf4",
  forest: "#314329",
  forestDeep: "#1a2c16",
  clay: "#bf623d",
  text: "#25321e",
  border: "#ddd4bb",
};

const branding = {
  designSystem: {
    colors: {
      global: { brand: palette.forest, accent: palette.clay },
      schemes: {
        scheme1: {
          base: {
            background: palette.cream,
            text: palette.text,
            border: palette.border,
            accent: palette.forest,
          },
          primaryButton: {
            background: palette.forest,
            text: palette.cream,
            hover: { background: palette.forestDeep, text: palette.cream },
          },
          control: {
            background: palette.card,
            text: palette.text,
            border: palette.border,
            accent: palette.forest,
          },
        },
      },
    },
  },
};

async function main() {
  const { shop, checkoutProfiles } = await admin<{
    shop: { name: string; plan: { partnerDevelopment: boolean } };
    checkoutProfiles: { nodes: { id: string; isPublished: boolean }[] };
  }>(
    `{ shop { name plan { partnerDevelopment } } checkoutProfiles(first: 5) { nodes { id isPublished } } }`,
  );
  console.log(`Store: ${shop.name} (development: ${shop.plan.partnerDevelopment})`);
  if (apply && !shop.plan.partnerDevelopment && process.env["SHOPIFY_ALLOW_WRITE"] !== "1") {
    throw new Error(
      "Refusing to write to a non-development store (set SHOPIFY_ALLOW_WRITE=1 to override).",
    );
  }
  const profile = checkoutProfiles.nodes.find((candidate) => candidate.isPublished);
  if (!profile)
    throw new Error("No published checkout profile (checkout extensibility is required)");
  console.log(`${apply ? "[apply]" : "[dry-run]"} checkout branding on ${profile.id}`);
  if (!apply) return;

  const result = await admin<{
    checkoutBrandingUpsert: { userErrors: { field: string[] | null; message: string }[] };
  }>(
    `mutation($id: ID!, $in: CheckoutBrandingInput!) {
      checkoutBrandingUpsert(checkoutProfileId: $id, checkoutBrandingInput: $in) {
        userErrors { field message }
      }
    }`,
    { id: profile.id, in: branding },
  );
  const errors = result.checkoutBrandingUpsert.userErrors;
  if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
  console.log("Checkout branding applied");
}

await main();
