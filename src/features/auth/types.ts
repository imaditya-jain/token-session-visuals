export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: "customer" | "staff" | "admin";
  acceptsMarketing: boolean;
  emailVerified: boolean;
};

/** Serializable error shape stored in Redux and shown by forms. */
export type ApiFailure = {
  status: number;
  code: string;
  message: string;
  fields?: { path: string; message: string }[];
  retryAfterSeconds?: number;
};
