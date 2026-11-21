/**
 * Idempotent Shopify B2B setup for wholesale (dev store).
 *
 *   node --env-file=.env scripts/seed-wholesale.ts           # dry run (default, no writes)
 *   node --env-file=.env scripts/seed-wholesale.ts --apply   # write; refuses non-development stores
 *
 * Creates the standard Shopify B2B structure (needs Shopify Plus, or the plan tier that includes B2B):
 *   - a "Wholesale" catalog whose price list is a percentage off the retail price (PLACEHOLDER: 30%, change it
 *     in Admin > Catalogs), published to every product automatically,
 *   - one sample company + location ("Sample Wholesale Café") attached to that catalog with Net 30 payment
 *     terms, so the wholesale pricing can be verified end to end. Delete it before launch.
 *
 * Approved wholesale applicants (see /wholesale) are set up by the owner in Admin > Customers > Companies:
 * add the company, a location, a contact, and attach the Wholesale catalog to the location.
 */
const API_VERSION = "2025-10";
const apply = process.argv.includes("--apply");
const DISCOUNT_PERCENT = 30;
const CATALOG_TITLE = "Wholesale";
const COMPANY_EXTERNAL_ID = "fernwood-sample-wholesale-cafe";
const NET_30_TERMS = "Net 30";

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

function assertNoErrors(label: string, errors: UserError[]) {
  if (errors.length)
    throw new Error(
      `${label}: ${errors.map((e) => `${e.field?.join(".") ?? ""} ${e.message} ${e.code ?? ""}`).join("; ")}`,
    );
}

const log = (message: string) => console.log(`${apply ? "[apply]" : "[dry-run]"} ${message}`);

async function ensureCompany(): Promise<{ companyId: string; locationId: string }> {
  const found = await admin<{
    companies: { nodes: { id: string; locations: { nodes: { id: string }[] } }[] };
  }>(
    `query($q: String!) { companies(first: 1, query: $q) { nodes { id locations(first: 1) { nodes { id } } } } }`,
    { q: `external_id:${COMPANY_EXTERNAL_ID}` },
  );
  const existing = found.companies.nodes[0];
  const existingLocation = existing?.locations.nodes[0];
  if (existing && existingLocation)
    return { companyId: existing.id, locationId: existingLocation.id };

  const created = await admin<{
    companyCreate: {
      company: { id: string; locations: { nodes: { id: string }[] } } | null;
      userErrors: UserError[];
    };
  }>(
    `mutation($input: CompanyCreateInput!) {
      companyCreate(input: $input) {
        company { id locations(first: 1) { nodes { id } } }
        userErrors { field message code }
      }
    }`,
    {
      input: {
        company: { name: "Sample Wholesale Café", externalId: COMPANY_EXTERNAL_ID },
        companyLocation: {
          name: "Sample Wholesale Café (Pune)",
          shippingAddress: {
            address1: "22 Baner Road",
            city: "Pune",
            zip: "411045",
            zoneCode: "MH",
            countryCode: "IN",
          },
          billingSameAsShipping: true,
        },
      },
    },
  );
  assertNoErrors("companyCreate", created.companyCreate.userErrors);
  const company = created.companyCreate.company;
  const location = company?.locations.nodes[0];
  if (!company || !location) throw new Error("companyCreate returned no company location");
  return { companyId: company.id, locationId: location.id };
}

async function ensureCatalog(
  locationId: string,
): Promise<{ catalogId: string; publicationId: string }> {
  const found = await admin<{
    catalogs: { nodes: { id: string; title: string }[] };
  }>(`query($q: String!) { catalogs(first: 5, query: $q) { nodes { id title } } }`, {
    q: `title:${CATALOG_TITLE}`,
  });
  const existing = found.catalogs.nodes.find((catalog) => catalog.title === CATALOG_TITLE);
  if (existing) {
    const attach = await admin<{ catalogContextUpdate: { userErrors: UserError[] } }>(
      `mutation($id: ID!, $ctx: CatalogContextInput!) {
        catalogContextUpdate(catalogId: $id, contextsToAdd: $ctx) { userErrors { field message } }
      }`,
      { id: existing.id, ctx: { companyLocationIds: [locationId] } },
    );
    // Attaching a location that is already attached is not an error worth stopping for.
    if (attach.catalogContextUpdate.userErrors.some((e) => !/already/i.test(e.message)))
      assertNoErrors("catalogContextUpdate", attach.catalogContextUpdate.userErrors);
    return { catalogId: existing.id, publicationId: await publicationOf(existing.id) };
  }

  const created = await admin<{
    catalogCreate: { catalog: { id: string } | null; userErrors: UserError[] };
  }>(
    `mutation($input: CatalogCreateInput!) {
      catalogCreate(input: $input) { catalog { id } userErrors { field message } }
    }`,
    {
      input: {
        title: CATALOG_TITLE,
        status: "ACTIVE",
        context: { companyLocationIds: [locationId] },
      },
    },
  );
  assertNoErrors("catalogCreate", created.catalogCreate.userErrors);
  const catalogId = created.catalogCreate.catalog?.id;
  if (!catalogId) throw new Error("catalogCreate returned no catalog");

  const priceList = await admin<{
    priceListCreate: { priceList: { id: string } | null; userErrors: UserError[] };
  }>(
    `mutation($input: PriceListCreateInput!) {
      priceListCreate(input: $input) { priceList { id } userErrors { field message } }
    }`,
    {
      input: {
        name: "Wholesale prices",
        currency: "USD",
        catalogId,
        parent: { adjustment: { type: "PERCENTAGE_DECREASE", value: DISCOUNT_PERCENT } },
      },
    },
  );
  assertNoErrors("priceListCreate", priceList.priceListCreate.userErrors);

  const publication = await admin<{
    publicationCreate: { publication: { id: string } | null; userErrors: UserError[] };
  }>(
    `mutation($input: PublicationCreateInput!) {
      publicationCreate(input: $input) { publication { id } userErrors { field message } }
    }`,
    { input: { catalogId, autoPublish: true } },
  );
  assertNoErrors("publicationCreate", publication.publicationCreate.userErrors);
  const publicationId = publication.publicationCreate.publication?.id;
  if (!publicationId) throw new Error("publicationCreate returned no publication");
  return { catalogId, publicationId };
}

async function publicationOf(catalogId: string): Promise<string> {
  const { catalog } = await admin<{ catalog: { publication: { id: string } | null } | null }>(
    `query($id: ID!) { catalog(id: $id) { publication { id } } }`,
    { id: catalogId },
  );
  const id = catalog?.publication?.id;
  if (!id) throw new Error("The Wholesale catalog has no publication");
  return id;
}

/** Auto-publish only covers products created later, so publish every existing product to the catalog too. */
async function publishAllProducts(publicationId: string): Promise<number> {
  let cursor: string | null = null;
  let count = 0;
  for (;;) {
    const page: {
      products: {
        nodes: { id: string }[];
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await admin(
      `query($after: String) { products(first: 100, after: $after) { nodes { id } pageInfo { hasNextPage endCursor } } }`,
      { after: cursor },
    );
    for (const product of page.products.nodes) {
      const result = await admin<{ publishablePublish: { userErrors: UserError[] } }>(
        `mutation($id: ID!, $in: [PublicationInput!]!) { publishablePublish(id: $id, input: $in) { userErrors { message } } }`,
        { id: product.id, in: [{ publicationId }] },
      );
      assertNoErrors("publishablePublish", result.publishablePublish.userErrors);
      count++;
    }
    if (!page.products.pageInfo.hasNextPage) return count;
    cursor = page.products.pageInfo.endCursor;
  }
}

async function setPaymentTerms(locationId: string) {
  const { paymentTermsTemplates } = await admin<{
    paymentTermsTemplates: { id: string; name: string }[];
  }>(`{ paymentTermsTemplates { id name } }`);
  const net30 = paymentTermsTemplates.find((template) => template.name === NET_30_TERMS);
  if (!net30) throw new Error(`Payment terms template "${NET_30_TERMS}" not found`);
  const updated = await admin<{ companyLocationUpdate: { userErrors: UserError[] } }>(
    `mutation($id: ID!, $input: CompanyLocationUpdateInput!) {
      companyLocationUpdate(companyLocationId: $id, input: $input) { userErrors { field message } }
    }`,
    {
      id: locationId,
      input: { buyerExperienceConfiguration: { paymentTermsTemplateId: net30.id } },
    },
  );
  assertNoErrors("companyLocationUpdate", updated.companyLocationUpdate.userErrors);
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
  log(`company "${COMPANY_EXTERNAL_ID}" with one location (Net 30)`);
  log(
    `catalog "${CATALOG_TITLE}" with a ${DISCOUNT_PERCENT}% price list, published to all products`,
  );
  if (!apply) return;

  const { companyId, locationId } = await ensureCompany();
  const { catalogId, publicationId } = await ensureCatalog(locationId);
  await setPaymentTerms(locationId);
  const published = await publishAllProducts(publicationId);
  console.log(
    `Company ${companyId}, location ${locationId}, catalog ${catalogId}, ${published} products published`,
  );
}

await main();
