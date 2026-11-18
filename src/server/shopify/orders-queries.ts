import "server-only";

const ORDER_FIELDS = /* GraphQL */ `
  fragment OrderFields on Order {
    id
    name
    email
    processedAt
    createdAt
    cancelledAt
    displayFinancialStatus
    displayFulfillmentStatus
    currentTotalPriceSet {
      shopMoney {
        amount
        currencyCode
      }
    }
    currentSubtotalPriceSet {
      shopMoney {
        amount
        currencyCode
      }
    }
    totalShippingPriceSet {
      shopMoney {
        amount
        currencyCode
      }
    }
    currentTotalTaxSet {
      shopMoney {
        amount
        currencyCode
      }
    }
    lineItems(first: 50) {
      nodes {
        title
        quantity
        variantTitle
        image {
          url
        }
        originalUnitPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
    }
    fulfillments(first: 10) {
      trackingInfo {
        company
        number
        url
      }
    }
    shippingAddress {
      city
      province
      country
    }
  }
`;

export const ORDERS_QUERY = /* GraphQL */ `
  ${ORDER_FIELDS}
  query CustomerOrders($first: Int, $last: Int, $after: String, $before: String, $query: String!) {
    orders(
      first: $first
      last: $last
      after: $after
      before: $before
      query: $query
      sortKey: PROCESSED_AT
      reverse: true
    ) {
      nodes {
        ...OrderFields
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

export const ORDER_QUERY = /* GraphQL */ `
  ${ORDER_FIELDS}
  query CustomerOrder($id: ID!) {
    order(id: $id) {
      ...OrderFields
    }
  }
`;
