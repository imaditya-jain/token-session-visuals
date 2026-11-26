/**
 * Idempotent seeder for plant-care products (sprays, feeds, soil, tools) on the dev store, so the Plant Doctor has real
 * shop items to recommend.
 *
 *   node --env-file=.env scripts/seed-plant-care.ts           # dry run (default, no writes)
 *   node --env-file=.env scripts/seed-plant-care.ts --apply   # write; refuses non-development stores
 *
 * Source: scripts/seed-data/plant-care.json (names, PLACEHOLDER prices and copy) and the pictures in
 * scripts/seed-data/plant-care/ (Fernwood illustrations, uploaded straight to Shopify, so no deploy is needed).
 * Products are ACTIVE, published to every sales channel, tracked stock. Re-running never duplicates anything:
 * products are matched by handle and pictures are only attached to products that have none. No collection is
 * created on purpose (a storefront collection would add a card to the home page).
 */
import { readFileSync, statSync } from "node:fs";

const API_VERSION = "2025-10";
const DEFAULT_STOCK = 25;
const apply = process.argv.includes("--apply");

type Data = {
  products: {
    handle: string;
    title: string;
    price: string;
    light: string;
    size: string;
    description: string;
    image: string;
  }[];
};

const data = JSON.parse(
  readFileSync(new URL("./seed-data/plant-care.json", import.meta.url), "utf8"),
) as Data;

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
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`https://${host}/admin/api/${API_VERSION}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": adminToken },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json()) as {
      data?: T;
      errors?: { message: string; extensions?: { code?: string } }[];
    };
    const throttled = body.errors?.some((e) => e.extensions?.code === "THROTTLED");
    if (response.status === 429 || throttled) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      continue;
    }
    if (!response.ok || body.errors?.length || !body.data) {
      throw new Error(`Admin API error: ${JSON.stringify(body.errors ?? response.status)}`);
    }
    return body.data;
  }
  throw new Error("Admin API throttled too long");
}

function assertNoErrors(label: string, errors: UserError[]) {
  if (errors.length) throw new Error(`${label}: ${errors.map((e) => e.message).join("; ")}`);
}

const log = (message: string) => console.log(`${apply ? "[apply]" : "[dry-run]"} ${message}`);

/** Uploads a local picture to Shopify (staged upload) and returns the address Shopify can create the media from. */
async function upload(file: string): Promise<string> {
  const path = new URL(`./seed-data/plant-care/${file}`, import.meta.url);
  const bytes = readFileSync(path);
  const staged = await admin<{
    stagedUploadsCreate: {
      stagedTargets: {
        url: string;
        resourceUrl: string;
        parameters: { name: string; value: string }[];
      }[];
      userErrors: UserError[];
    };
  }>(
    `mutation($input: [StagedUploadInput!]!) { stagedUploadsCreate(input: $input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { message } } }`,
    {
      input: [
        {
          filename: file,
          mimeType: "image/jpeg",
          resource: "IMAGE",
          httpMethod: "POST",
          fileSize: String(statSync(path).size),
        },
      ],
    },
  );
  assertNoErrors("stagedUploadsCreate", staged.stagedUploadsCreate.userErrors);
  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("No upload target");
  const form = new FormData();
  for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
  form.append("file", new Blob([bytes], { type: "image/jpeg" }), file);
  const response = await fetch(target.url, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Upload of ${file} failed (${response.status})`);
  return target.resourceUrl;
}

async function main() {
  const { shop } = await admin<{ shop: { name: string; plan: { partnerDevelopment: boolean } } }>(
    `{ shop { name plan { partnerDevelopment } } }`,
  );
  console.log(`Store: ${shop.name} (development: ${shop.plan.partnerDevelopment})`);
  if (apply && !shop.plan.partnerDevelopment && process.env["SHOPIFY_ALLOW_WRITE"] !== "1") {
    throw new Error(
      "Refusing to write to a non-development store (set SHOPIFY_ALLOW_WRITE=1 to override).",
    );
  }

  const { publications } = await admin<{ publications: { nodes: { id: string }[] } }>(
    `{ publications(first: 20) { nodes { id } } }`,
  );
  // Stock goes where the original catalog's stock lives (the location that fulfils online orders), not just the
  // first location: a store can have several, and an item stocked elsewhere shows as unavailable at checkout.
  const reference = await admin<{
    productByHandle: {
      variants: {
        nodes: { inventoryItem: { inventoryLevels: { nodes: { location: { id: string } }[] } } }[];
      };
    } | null;
  }>(
    `query { productByHandle(handle: "monstera-deliciosa") { variants(first: 1) { nodes { inventoryItem { inventoryLevels(first: 5) { nodes { location { id } } } } } } } }`,
  );
  const location =
    reference.productByHandle?.variants.nodes[0]?.inventoryItem.inventoryLevels.nodes[0]?.location;
  if (!location)
    throw new Error("Could not determine the stock location from the original catalog");
  const publicationInput = publications.nodes.map((publication) => ({
    publicationId: publication.id,
  }));

  const productIds: string[] = [];
  for (const wanted of data.products) {
    log(`product ${wanted.handle} ($${wanted.price}, ${DEFAULT_STOCK} in stock, published)`);
    if (!apply) continue;

    const existing = await admin<{
      productByHandle: { id: string; mediaCount: { count: number } } | null;
    }>(`query($h: String!) { productByHandle(handle: $h) { id mediaCount { count } } }`, {
      h: wanted.handle,
    });
    const hasImages = (existing.productByHandle?.mediaCount.count ?? 0) > 0;

    const result = await admin<{
      productSet: { product: { id: string } | null; userErrors: UserError[] };
    }>(
      `mutation($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
        productSet(synchronous: true, input: $input, identifier: $identifier) {
          product { id }
          userErrors { field message }
        }
      }`,
      {
        identifier: { handle: wanted.handle },
        input: {
          handle: wanted.handle,
          title: wanted.title,
          status: "ACTIVE",
          productType: "Plant Care & Fertiliser",
          vendor: "Fernwood",
          tags: ["Fernwood", "Plant care"],
          descriptionHtml: `<p>${wanted.description}</p>`,
          productOptions: [{ name: "Title", position: 1, values: [{ name: "Default Title" }] }],
          variants: [
            {
              optionValues: [{ optionName: "Title", name: "Default Title" }],
              price: wanted.price,
              inventoryPolicy: "DENY",
              inventoryItem: { tracked: true, requiresShipping: true },
            },
          ],
          metafields: [
            {
              namespace: "custom",
              key: "light",
              type: "single_line_text_field",
              value: wanted.light,
            },
            {
              namespace: "custom",
              key: "size",
              type: "single_line_text_field",
              value: wanted.size,
            },
          ],
          ...(hasImages
            ? {}
            : {
                files: [
                  {
                    originalSource: await upload(wanted.image),
                    contentType: "IMAGE",
                    alt: wanted.title,
                  },
                ],
              }),
        },
      },
    );
    assertNoErrors(`productSet ${wanted.handle}`, result.productSet.userErrors);
    const product = result.productSet.product;
    if (!product) throw new Error(`productSet ${wanted.handle} returned no product`);
    productIds.push(product.id);

    const inventory = await admin<{
      product: {
        variants: { nodes: { inventoryItem: { id: string } }[] };
      };
    }>(
      `query($id: ID!) { product(id: $id) { variants(first: 1) { nodes { inventoryItem { id } } } } }`,
      {
        id: product.id,
      },
    );
    const item = inventory.product.variants.nodes[0]?.inventoryItem.id;
    if (!item) throw new Error(`No inventory item for ${wanted.handle}`);
    const activated = await admin<{ inventoryActivate: { userErrors: UserError[] } }>(
      `mutation($i: ID!, $l: ID!) { inventoryActivate(inventoryItemId: $i, locationId: $l) { userErrors { message } } }`,
      { i: item, l: location.id },
    );
    assertNoErrors("inventoryActivate", activated.inventoryActivate.userErrors);
    const stock = await admin<{ inventorySetQuantities: { userErrors: UserError[] } }>(
      `mutation($i: InventorySetQuantitiesInput!) { inventorySetQuantities(input: $i) { userErrors { message } } }`,
      {
        i: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: [{ inventoryItemId: item, locationId: location.id, quantity: DEFAULT_STOCK }],
        },
      },
    );
    assertNoErrors("inventorySetQuantities", stock.inventorySetQuantities.userErrors);

    // Clear any stock a previous run put at another location, so totals and availability agree.
    const levels = await admin<{
      inventoryItem: { inventoryLevels: { nodes: { location: { id: string } }[] } };
    }>(
      `query($id: ID!) { inventoryItem(id: $id) { inventoryLevels(first: 10) { nodes { location { id } } } } }`,
      { id: item },
    );
    for (const level of levels.inventoryItem.inventoryLevels.nodes) {
      if (level.location.id === location.id) continue;
      const cleared = await admin<{ inventorySetQuantities: { userErrors: UserError[] } }>(
        `mutation($i: InventorySetQuantitiesInput!) { inventorySetQuantities(input: $i) { userErrors { message } } }`,
        {
          i: {
            name: "available",
            reason: "correction",
            ignoreCompareQuantity: true,
            quantities: [{ inventoryItemId: item, locationId: level.location.id, quantity: 0 }],
          },
        },
      );
      assertNoErrors(
        "inventorySetQuantities (other location)",
        cleared.inventorySetQuantities.userErrors,
      );
    }

    const published = await admin<{ publishablePublish: { userErrors: UserError[] } }>(
      `mutation($id: ID!, $in: [PublicationInput!]!) { publishablePublish(id: $id, input: $in) { userErrors { message } } }`,
      { id: product.id, in: publicationInput },
    );
    assertNoErrors("publishablePublish", published.publishablePublish.userErrors);
  }

  console.log(`Seeded ${productIds.length} plant-care products`);
}

await main();
