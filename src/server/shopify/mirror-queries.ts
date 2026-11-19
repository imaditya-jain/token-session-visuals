import "server-only";

const PRODUCT_FIELDS = /* GraphQL */ `
  fragment MirrorProduct on Product {
    id
    handle
    title
    status
    productType
    tags
    updatedAt
    variants(first: 100) {
      nodes {
        id
        sku
        title
      }
    }
    collections(first: 100) {
      nodes {
        id
      }
    }
  }
`;

const COLLECTION_FIELDS = /* GraphQL */ `
  fragment MirrorCollection on Collection {
    id
    handle
    title
    updatedAt
  }
`;

const ORDER_FIELDS = /* GraphQL */ `
  fragment MirrorOrder on Order {
    id
    name
    email
    updatedAt
    processedAt
    cancelledAt
    displayFinancialStatus
    displayFulfillmentStatus
    customer {
      id
    }
    currentTotalPriceSet {
      shopMoney {
        amount
        currencyCode
      }
    }
    lineItems(first: 100) {
      nodes {
        id
        title
        quantity
        product {
          id
        }
        variant {
          id
        }
      }
    }
  }
`;

const PAGE_INFO = `pageInfo { hasNextPage endCursor }`;

export const MIRROR_PRODUCT_QUERY = /* GraphQL */ `
  ${PRODUCT_FIELDS}
  query MirrorProduct($id: ID!) {
    product(id: $id) {
      ...MirrorProduct
    }
  }
`;
export const MIRROR_PRODUCTS_QUERY = /* GraphQL */ `
  ${PRODUCT_FIELDS}
  query MirrorProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: ID) {
      nodes {
        ...MirrorProduct
      }
      ${PAGE_INFO}
    }
  }
`;

export const MIRROR_COLLECTION_QUERY = /* GraphQL */ `
  ${COLLECTION_FIELDS}
  query MirrorCollection($id: ID!) {
    collection(id: $id) {
      ...MirrorCollection
    }
  }
`;
export const MIRROR_COLLECTIONS_QUERY = /* GraphQL */ `
  ${COLLECTION_FIELDS}
  query MirrorCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after, sortKey: ID) {
      nodes {
        ...MirrorCollection
      }
      ${PAGE_INFO}
    }
  }
`;

export const MIRROR_ORDER_QUERY = /* GraphQL */ `
  ${ORDER_FIELDS}
  query MirrorOrder($id: ID!) {
    order(id: $id) {
      ...MirrorOrder
    }
  }
`;
export const MIRROR_ORDERS_QUERY = /* GraphQL */ `
  ${ORDER_FIELDS}
  query MirrorOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT) {
      nodes {
        ...MirrorOrder
      }
      ${PAGE_INFO}
    }
  }
`;
