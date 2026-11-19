import "server-only";

const PRODUCT_FIELDS = /* GraphQL */ `
  fragment ProductFields on Product {
    id
    handle
    title
    productType
    tags
    availableForSale
    priceRange {
      minVariantPrice {
        amount
      }
    }
    compareAtPriceRange {
      minVariantPrice {
        amount
      }
    }
    featuredImage {
      url
    }
    variants(first: 1) {
      nodes {
        id
      }
    }
    light: metafield(namespace: "custom", key: "light") {
      value
    }
    size: metafield(namespace: "custom", key: "size") {
      value
    }
    collections(first: 20) {
      nodes {
        handle
        tagline: metafield(namespace: "custom", key: "tagline") {
          value
        }
      }
    }
  }
`;

const COLLECTION_FIELDS = /* GraphQL */ `
  fragment CollectionFields on Collection {
    handle
    title
    description
    image {
      url
    }
    tagline: metafield(namespace: "custom", key: "tagline") {
      value
    }
    position: metafield(namespace: "custom", key: "position") {
      value
    }
  }
`;

export const COLLECTIONS_QUERY = /* GraphQL */ `
  ${COLLECTION_FIELDS}
  query Collections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      nodes {
        ...CollectionFields
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const COLLECTION_QUERY = /* GraphQL */ `
  ${COLLECTION_FIELDS}
  query Collection($handle: String!) {
    collection(handle: $handle) {
      ...CollectionFields
    }
  }
`;

export const COLLECTION_PRODUCTS_QUERY = /* GraphQL */ `
  ${PRODUCT_FIELDS}
  query CollectionProducts($handle: String!, $first: Int!, $after: String) {
    collection(handle: $handle) {
      products(first: $first, after: $after, sortKey: COLLECTION_DEFAULT) {
        nodes {
          ...ProductFields
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

export const PRODUCT_QUERY = /* GraphQL */ `
  ${PRODUCT_FIELDS}
  query Product($handle: String!) {
    product(handle: $handle) {
      ...ProductFields
    }
  }
`;

export const PRODUCTS_QUERY = /* GraphQL */ `
  ${PRODUCT_FIELDS}
  query Products($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      nodes {
        ...ProductFields
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const PRODUCT_PAGE_QUERY = /* GraphQL */ `
  ${PRODUCT_FIELDS}
  query ProductPage(
    $first: Int
    $last: Int
    $after: String
    $before: String
    $query: String
    $sortKey: ProductSortKeys
    $reverse: Boolean
  ) {
    products(
      first: $first
      last: $last
      after: $after
      before: $before
      query: $query
      sortKey: $sortKey
      reverse: $reverse
    ) {
      nodes {
        ...ProductFields
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
    }
  }
`;

export const PRODUCT_TYPES_QUERY = /* GraphQL */ `
  query ProductTypes {
    productTypes(first: 250) {
      nodes
    }
  }
`;

export const COLLECTION_PAGE_QUERY = /* GraphQL */ `
  ${PRODUCT_FIELDS}
  query CollectionPage(
    $handle: String!
    $first: Int
    $last: Int
    $after: String
    $before: String
    $filters: [ProductFilter!]
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
  ) {
    collection(handle: $handle) {
      products(
        first: $first
        last: $last
        after: $after
        before: $before
        filters: $filters
        sortKey: $sortKey
        reverse: $reverse
      ) {
        nodes {
          ...ProductFields
        }
        pageInfo {
          hasNextPage
          hasPreviousPage
          startCursor
          endCursor
        }
      }
    }
  }
`;
