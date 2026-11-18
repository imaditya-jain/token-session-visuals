/**
 * Idempotent Shopify dev-store seeder.
 *
 * Brings the store to parity with the locked storefront design: collections, the curated
 * home best-sellers list, product metafields (light/size), "Bestseller" tags and inventory.
 *
 *   node --env-file=.env scripts/seed-shopify.ts           # dry run (default, no writes)
 *   node --env-file=.env scripts/seed-shopify.ts --apply   # write; refuses non-development stores
 *
 * Source of truth: scripts/seed-data/catalog.snapshot.json (frozen from the original design).
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const API_VERSION = "2025-10";
const DEFAULT_STOCK = 25;
const apply = process.argv.includes("--apply");

type Snapshot = {
  collections: {
    handle: string;
    title: string;
    tagline: string;
    description: string;
    imageFile: string;
    productType: string;
  }[];
  bestSellers: { handle: string; title: string; products: string[] };
  products: {
    handle: string;
    name: string;
    category: string;
    badge: string | null;
    light: string;
    size: string;
    inStock: boolean;
    collections: string[];
  }[];
};

const snapshot = JSON.parse(
  readFileSync(new URL("./seed-data/catalog.snapshot.json", import.meta.url), "utf8"),
) as Snapshot;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

const host = requireEnv("SHOPIFY_STORE_URL")
  .replace(/^https?:\/\//, "")
  .replace(/\/.*$/, "");
const adminToken = requireEnv("SHOPIFY_ADMIN_API_ACCESS_TOKEN");

type UserError = { field?: string[] | null; message: string; code?: string | null };

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

function assertNoErrors(label: string, errors: UserError[], tolerate: string[] = []) {
  const real = errors.filter((e) => !(e.code && tolerate.includes(e.code)));
  if (real.length) throw new Error(`${label}: ${real.map((e) => e.message).join("; ")}`);
}

const log = (message: string) => console.log(`${apply ? "[apply]" : "[dry-run]"} ${message}`);

async function assertDevelopmentStore() {
  const { shop } = await admin<{
    shop: { name: string; plan: { partnerDevelopment: boolean } };
  }>(`{ shop { name plan { partnerDevelopment } } }`);
  console.log(`Store: ${shop.name} (development: ${shop.plan.partnerDevelopment})`);
  if (apply && !shop.plan.partnerDevelopment && process.env["SHOPIFY_ALLOW_WRITE"] !== "1") {
    throw new Error(
      "Refusing to write to a non-development store (set SHOPIFY_ALLOW_WRITE=1 to override).",
    );
  }
}

async function ensureMetafieldDefinitions() {
  const defs = [
    { ownerType: "PRODUCT", key: "light", name: "Light", type: "single_line_text_field" },
    { ownerType: "PRODUCT", key: "size", name: "Size", type: "single_line_text_field" },
    { ownerType: "COLLECTION", key: "tagline", name: "Tagline", type: "single_line_text_field" },
    { ownerType: "COLLECTION", key: "position", name: "Position", type: "number_integer" },
  ];
  for (const def of defs) {
    log(`metafield definition ${def.ownerType}.custom.${def.key} (storefront readable)`);
    if (!apply) continue;
    const { metafieldDefinitionCreate } = await admin<{
      metafieldDefinitionCreate: { userErrors: UserError[] };
    }>(
      `mutation($d: MetafieldDefinitionInput!) {
        metafieldDefinitionCreate(definition: $d) { userErrors { field message code } }
      }`,
      {
        d: {
          name: def.name,
          namespace: "custom",
          key: def.key,
          type: def.type,
          ownerType: def.ownerType,
          access: { storefront: "PUBLIC_READ" },
        },
      },
    );
    assertNoErrors("metafieldDefinitionCreate", metafieldDefinitionCreate.userErrors, ["TAKEN"]);
  }
}

type ShopProduct = {
  id: string;
  handle: string;
  tags: string[];
  variants: {
    nodes: {
      id: string;
      inventoryPolicy: string;
      inventoryItem: {
        id: string;
        tracked: boolean;
        inventoryLevels: {
          nodes: { location: { id: string }; quantities: { name: string; quantity: number }[] }[];
        };
      };
    }[];
  };
  resourcePublicationsV2: { nodes: { publication: { id: string }; isPublished: boolean }[] };
};

async function loadProducts(): Promise<Map<string, ShopProduct>> {
  const { products } = await admin<{ products: { nodes: ShopProduct[] } }>(`{
    products(first: 100) { nodes {
      id handle tags
      resourcePublicationsV2(first: 20) { nodes { publication { id } isPublished } }
      variants(first: 5) { nodes { id inventoryPolicy
        inventoryItem { id tracked inventoryLevels(first: 5) { nodes { location { id } quantities(names: ["available"]) { name quantity } } } }
      } }
    } }
  }`);
  return new Map(products.nodes.map((p) => [p.handle, p]));
}

async function syncProduct(product: ShopProduct, wanted: Snapshot["products"][number]) {
  log(
    `product ${wanted.handle}: metafields, tags, inventory (${wanted.inStock ? DEFAULT_STOCK : 0})`,
  );
  if (!apply) return;

  const mf = await admin<{ metafieldsSet: { userErrors: UserError[] } }>(
    `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message code } } }`,
    {
      m: [
        {
          ownerId: product.id,
          namespace: "custom",
          key: "light",
          type: "single_line_text_field",
          value: wanted.light,
        },
        {
          ownerId: product.id,
          namespace: "custom",
          key: "size",
          type: "single_line_text_field",
          value: wanted.size,
        },
      ],
    },
  );
  assertNoErrors("metafieldsSet", mf.metafieldsSet.userErrors);

  const hasBadgeTag = product.tags.includes("Bestseller");
  if (wanted.badge === "Bestseller" && !hasBadgeTag) {
    const tags = await admin<{ tagsAdd: { userErrors: UserError[] } }>(
      `mutation($id: ID!, $t: [String!]!) { tagsAdd(id: $id, tags: $t) { userErrors { message } } }`,
      { id: product.id, t: ["Bestseller"] },
    );
    assertNoErrors("tagsAdd", tags.tagsAdd.userErrors);
  }

  const quantity = wanted.inStock ? DEFAULT_STOCK : 0;
  for (const variant of product.variants.nodes) {
    const item = variant.inventoryItem;
    if (!item.tracked) {
      const res = await admin<{ inventoryItemUpdate: { userErrors: UserError[] } }>(
        `mutation($id: ID!) { inventoryItemUpdate(id: $id, input: { tracked: true }) { userErrors { message } } }`,
        { id: item.id },
      );
      assertNoErrors("inventoryItemUpdate", res.inventoryItemUpdate.userErrors);
    }
    if (variant.inventoryPolicy !== "DENY") {
      const res = await admin<{ productVariantsBulkUpdate: { userErrors: UserError[] } }>(
        `mutation($p: ID!, $v: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $p, variants: $v) { userErrors { message } }
        }`,
        { p: product.id, v: [{ id: variant.id, inventoryPolicy: "DENY" }] },
      );
      assertNoErrors("productVariantsBulkUpdate", res.productVariantsBulkUpdate.userErrors);
    }
    const level = item.inventoryLevels.nodes[0];
    if (!level) throw new Error(`No inventory location for ${product.handle}`);
    const res = await admin<{ inventorySetQuantities: { userErrors: UserError[] } }>(
      `mutation($i: InventorySetQuantitiesInput!) { inventorySetQuantities(input: $i) { userErrors { message } } }`,
      {
        i: {
          name: "available",
          reason: "correction",
          ignoreCompareQuantity: true,
          quantities: [{ inventoryItemId: item.id, locationId: level.location.id, quantity }],
        },
      },
    );
    assertNoErrors("inventorySetQuantities", res.inventorySetQuantities.userErrors);
  }
}

async function uploadImage(file: string): Promise<string> {
  const filename = basename(file);
  const { stagedUploadsCreate } = await admin<{
    stagedUploadsCreate: {
      stagedTargets: {
        url: string;
        resourceUrl: string;
        parameters: { name: string; value: string }[];
      }[];
      userErrors: UserError[];
    };
  }>(
    `mutation($i: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $i) { stagedTargets { url resourceUrl parameters { name value } } userErrors { message } }
    }`,
    { i: [{ resource: "IMAGE", filename, mimeType: "image/jpeg", httpMethod: "POST" }] },
  );
  assertNoErrors("stagedUploadsCreate", stagedUploadsCreate.userErrors);
  const target = stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("No staged upload target");
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append(
    "file",
    new Blob([readFileSync(new URL(`../${file}`, import.meta.url))], { type: "image/jpeg" }),
    filename,
  );
  const upload = await fetch(target.url, { method: "POST", body: form });
  if (!upload.ok) throw new Error(`Image upload failed (${upload.status})`);
  return target.resourceUrl;
}

type ShopCollection = { id: string; handle: string; products: { nodes: { handle: string }[] } };

async function findCollection(handle: string): Promise<ShopCollection | null> {
  const { collectionByIdentifier } = await admin<{ collectionByIdentifier: ShopCollection | null }>(
    `query($h: String!) {
      collectionByIdentifier(identifier: { handle: $h }) { id handle products(first: 100) { nodes { handle } } }
    }`,
    { h: handle },
  );
  return collectionByIdentifier;
}

async function syncCollection(
  spec: {
    handle: string;
    title: string;
    description?: string;
    tagline?: string;
    position?: number;
    imageFile?: string;
    productHandles: string[];
  },
  products: Map<string, ShopProduct>,
  publicationIds: string[],
) {
  const productIds = spec.productHandles.map((handle) => {
    const product = products.get(handle);
    if (!product) throw new Error(`Collection ${spec.handle}: unknown product ${handle}`);
    return product.id;
  });
  const existing = await findCollection(spec.handle);
  log(
    `collection ${spec.handle}: ${existing ? "update/add missing products" : "create"} (${productIds.length} products)`,
  );
  if (!apply) return;

  const metafields = [
    ...(spec.tagline
      ? [
          {
            namespace: "custom",
            key: "tagline",
            type: "single_line_text_field",
            value: spec.tagline,
          },
        ]
      : []),
    ...(spec.position !== undefined
      ? [
          {
            namespace: "custom",
            key: "position",
            type: "number_integer",
            value: String(spec.position),
          },
        ]
      : []),
  ];

  if (!existing) {
    const image = spec.imageFile
      ? { src: await uploadImage(spec.imageFile), altText: spec.title }
      : undefined;
    const res = await admin<{
      collectionCreate: { collection: { id: string } | null; userErrors: UserError[] };
    }>(
      `mutation($i: CollectionInput!) {
        collectionCreate(input: $i) { collection { id } userErrors { field message } }
      }`,
      {
        i: {
          title: spec.title,
          handle: spec.handle,
          descriptionHtml: spec.description ? `<p>${spec.description}</p>` : undefined,
          sortOrder: "MANUAL",
          image,
          metafields,
          products: productIds,
        },
      },
    );
    assertNoErrors("collectionCreate", res.collectionCreate.userErrors);
    const id = res.collectionCreate.collection?.id;
    if (!id) throw new Error(`collectionCreate returned no id for ${spec.handle}`);
    for (const publicationId of publicationIds) {
      const pub = await admin<{ publishablePublish: { userErrors: UserError[] } }>(
        `mutation($id: ID!, $p: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $p) { userErrors { message } }
        }`,
        { id, p: [{ publicationId }] },
      );
      assertNoErrors("publishablePublish", pub.publishablePublish.userErrors);
    }
    return;
  }

  const have = new Set(existing.products.nodes.map((p) => p.handle));
  const missing = spec.productHandles.filter((h) => !have.has(h)).map((h) => products.get(h)!.id);
  const upd = await admin<{ collectionUpdate: { userErrors: UserError[] } }>(
    `mutation($i: CollectionInput!) { collectionUpdate(input: $i) { userErrors { field message } } }`,
    {
      i: {
        id: existing.id,
        title: spec.title,
        descriptionHtml: spec.description ? `<p>${spec.description}</p>` : undefined,
        metafields,
      },
    },
  );
  assertNoErrors("collectionUpdate", upd.collectionUpdate.userErrors);
  if (missing.length) {
    const add = await admin<{ collectionAddProductsV2: { userErrors: UserError[] } }>(
      `mutation($id: ID!, $p: [ID!]!) { collectionAddProductsV2(id: $id, productIds: $p) { userErrors { message } } }`,
      { id: existing.id, p: missing },
    );
    assertNoErrors("collectionAddProductsV2", add.collectionAddProductsV2.userErrors);
  }
}

async function main() {
  await assertDevelopmentStore();
  await ensureMetafieldDefinitions();

  const products = await loadProducts();
  for (const wanted of snapshot.products) {
    const product = products.get(wanted.handle);
    if (!product) throw new Error(`Product ${wanted.handle} not found in Shopify`);
    await syncProduct(product, wanted);
  }

  const first = products.get(snapshot.products[0]!.handle)!;
  const publicationIds = first.resourcePublicationsV2.nodes
    .filter((n) => n.isPublished)
    .map((n) => n.publication.id);
  console.log(`Publishing new collections to ${publicationIds.length} channel(s)`);

  for (const collection of snapshot.collections) {
    await syncCollection(
      {
        handle: collection.handle,
        title: collection.title,
        description: collection.description,
        tagline: collection.tagline,
        position: snapshot.collections.indexOf(collection) + 1,
        imageFile: collection.imageFile,
        productHandles: snapshot.products
          .filter((p) => p.collections.includes(collection.handle))
          .map((p) => p.handle),
      },
      products,
      publicationIds,
    );
  }
  await syncCollection(
    {
      handle: snapshot.bestSellers.handle,
      title: snapshot.bestSellers.title,
      productHandles: snapshot.bestSellers.products,
    },
    products,
    publicationIds,
  );
  console.log(apply ? "Seed complete." : "Dry run complete. Re-run with --apply to write.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
