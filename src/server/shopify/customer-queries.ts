import "server-only";

const CUSTOMER_FIELDS = /* GraphQL */ `
  fragment CustomerFields on Customer {
    id
    email
  }
`;

export const CUSTOMER_BY_EMAIL_QUERY = /* GraphQL */ `
  ${CUSTOMER_FIELDS}
  query CustomerByEmail($query: String!) {
    customers(first: 1, query: $query) {
      nodes {
        ...CustomerFields
      }
    }
  }
`;

export const CUSTOMER_CREATE = /* GraphQL */ `
  ${CUSTOMER_FIELDS}
  mutation CustomerCreate($input: CustomerInput!) {
    customerCreate(input: $input) {
      customer {
        ...CustomerFields
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const CUSTOMER_UPDATE = /* GraphQL */ `
  ${CUSTOMER_FIELDS}
  mutation CustomerUpdate($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer {
        ...CustomerFields
      }
      userErrors {
        field
        message
      }
    }
  }
`;
