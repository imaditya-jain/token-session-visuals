import "server-only";

export const SHOP_POLICIES_QUERY = /* GraphQL */ `
  query ShopPolicies {
    shop {
      privacyPolicy {
        title
        body
      }
      termsOfService {
        title
        body
      }
      shippingPolicy {
        title
        body
      }
      refundPolicy {
        title
        body
      }
    }
  }
`;
