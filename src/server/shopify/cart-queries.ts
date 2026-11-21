import "server-only";

const CART_FIELDS = /* GraphQL */ `
  fragment CartFields on Cart {
    id
    checkoutUrl
    totalQuantity
    buyerIdentity {
      email
    }
    cost {
      subtotalAmount {
        amount
        currencyCode
      }
    }
    lines(first: 50) {
      nodes {
        id
        quantity
        cost {
          amountPerQuantity {
            amount
          }
          totalAmount {
            amount
          }
        }
        sellingPlanAllocation {
          sellingPlan {
            name
          }
        }
        merchandise {
          ... on ProductVariant {
            title
            image {
              url
            }
            product {
              handle
              title
              featuredImage {
                url
              }
            }
          }
        }
      }
    }
  }
`;

const USER_ERRORS = /* GraphQL */ `
  userErrors {
    code
    message
  }
`;

export const CART_QUERY = /* GraphQL */ `
  ${CART_FIELDS}
  query Cart($id: ID!) {
    cart(id: $id) {
      ...CartFields
    }
  }
`;

export const CART_CREATE = /* GraphQL */ `
  ${CART_FIELDS}
  mutation CartCreate($lines: [CartLineInput!]!) {
    cartCreate(input: { lines: $lines }) {
      cart {
        ...CartFields
      }
      ${USER_ERRORS}
    }
  }
`;

export const CART_LINES_ADD = /* GraphQL */ `
  ${CART_FIELDS}
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart {
        ...CartFields
      }
      ${USER_ERRORS}
    }
  }
`;

export const CART_LINES_UPDATE = /* GraphQL */ `
  ${CART_FIELDS}
  mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
    cartLinesUpdate(cartId: $cartId, lines: $lines) {
      cart {
        ...CartFields
      }
      ${USER_ERRORS}
    }
  }
`;

export const CART_LINES_REMOVE = /* GraphQL */ `
  ${CART_FIELDS}
  mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
    cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
      cart {
        ...CartFields
      }
      ${USER_ERRORS}
    }
  }
`;

export const CART_BUYER_IDENTITY_UPDATE = /* GraphQL */ `
  ${CART_FIELDS}
  mutation CartBuyerIdentityUpdate($cartId: ID!, $email: String) {
    cartBuyerIdentityUpdate(cartId: $cartId, buyerIdentity: { email: $email }) {
      cart {
        ...CartFields
      }
      ${USER_ERRORS}
    }
  }
`;
