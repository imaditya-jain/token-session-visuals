import "server-only";

export const GARDENER_PRODUCT_QUERY = /* GraphQL */ `
  query GardenerService($handle: String!) {
    product(handle: $handle) {
      title
      availableForSale
      variants(first: 1) {
        nodes {
          id
          price {
            amount
            currencyCode
          }
        }
      }
      sellingPlanGroups(first: 5) {
        nodes {
          sellingPlans(first: 10) {
            nodes {
              id
              name
              priceAdjustments {
                adjustmentValue {
                  ... on SellingPlanFixedPriceAdjustment {
                    price {
                      amount
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;
