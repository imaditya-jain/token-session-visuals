/**
 * Idempotent seeder for the "Gifts" collection and its products (dev store).
 *
 *   node --env-file=.env scripts/seed-gifts.ts           # dry run (default, no writes)
 *   node --env-file=.env scripts/seed-gifts.ts --apply   # write; refuses non-development stores
 *
 * Source: scripts/seed-data/gifts.json (names, placeholder prices, Unsplash photos; credits in
 * docs/IMAGE_CREDITS.md). Products are created ACTIVE and published to every sales channel, with the same
 * shape as the original catalog: custom.light / custom.size metafields, tracked stock, 4:5 images (800x1008).
 * Re-running never duplicates anything: products are matched by handle, images are only attached to products
 * that have none, and the collection only gains products it does not hold yet.
 */
import { readFileSync } from "node:fs";

const API_VERSION = "2025-10";
const DEFAULT_STOCK = 25;
const apply = process.argv.includes("--apply");

type Photo = { src: string; page: string; photographer: string; alt: string };
type Data = {
  collection: {
    handle: string;
    title: string;
    tagline: string;
    position: number;
    description: string;
    image: Photo;
  };
  products: {
    handle: string;
    title: string;
    price: string;
    light: string;
    size: string;
    description: string;
    image: Photo;
  }[];
};

const data = JSON.parse(
  readFileSync(new URL("./seed-data/gifts.json", import.meta.url), "utf8"),
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

/** Unsplash resizes and crops server-side; Shopify then stores its own copy, so nothing hot-links the photo. */
const cropped = (photo: Photo) => `${photo.src}?w=800&h=1008&fit=crop&crop=entropy&q=80&fm=jpg`;

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
          productType: "Gifts",
          vendor: "Fernwood",
          tags: ["Fernwood", "Gifts", "New"],
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
                    originalSource: cropped(wanted.image),
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

  const { collection } = data;
  log(
    `collection ${collection.handle} (position ${collection.position}, ${data.products.length} products)`,
  );
  if (!apply) return;

  const found = await admin<{ collectionByHandle: { id: string } | null }>(
    `query($h: String!) { collectionByHandle(handle: $h) { id } }`,
    { h: collection.handle },
  );
  let collectionId = found.collectionByHandle?.id;
  if (!collectionId) {
    const created = await admin<{
      collectionCreate: { collection: { id: string } | null; userErrors: UserError[] };
    }>(
      `mutation($i: CollectionInput!) { collectionCreate(input: $i) { collection { id } userErrors { field message } } }`,
      {
        i: {
          handle: collection.handle,
          title: collection.title,
          descriptionHtml: `<p>${collection.description}</p>`,
          sortOrder: "MANUAL",
          image: { src: cropped(collection.image), altText: collection.title },
          metafields: [
            {
              namespace: "custom",
              key: "tagline",
              type: "single_line_text_field",
              value: collection.tagline,
            },
            {
              namespace: "custom",
              key: "position",
              type: "number_integer",
              value: String(collection.position),
            },
          ],
        },
      },
    );
    assertNoErrors("collectionCreate", created.collectionCreate.userErrors);
    collectionId = created.collectionCreate.collection?.id;
  }
  if (!collectionId) throw new Error("Collection was not created");

  const held = await admin<{ collection: { products: { nodes: { id: string }[] } } }>(
    `query($id: ID!) { collection(id: $id) { products(first: 100) { nodes { id } } } }`,
    { id: collectionId },
  );
  const already = new Set(held.collection.products.nodes.map((p) => p.id));
  const missing = productIds.filter((id) => !already.has(id));
  if (missing.length) {
    const added = await admin<{ collectionAddProducts: { userErrors: UserError[] } }>(
      `mutation($id: ID!, $p: [ID!]!) { collectionAddProducts(id: $id, productIds: $p) { userErrors { message } } }`,
      { id: collectionId, p: missing },
    );
    assertNoErrors("collectionAddProducts", added.collectionAddProducts.userErrors);
  }
  const published = await admin<{ publishablePublish: { userErrors: UserError[] } }>(
    `mutation($id: ID!, $in: [PublicationInput!]!) { publishablePublish(id: $id, input: $in) { userErrors { message } } }`,
    { id: collectionId, in: publicationInput },
  );
  assertNoErrors("publishablePublish collection", published.publishablePublish.userErrors);
  console.log(`Collection ${collectionId} holds ${already.size + missing.length} products`);
}

await main();
