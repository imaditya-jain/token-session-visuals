declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * Browser-side error monitoring. Must be read with dot notation (`process.env.NEXT_PUBLIC_SENTRY_DSN`) in
     * client code: that is the only form the bundler replaces at build time and tree-shakes when unset.
     */
    readonly NEXT_PUBLIC_SENTRY_DSN?: string;
    readonly NEXT_PUBLIC_SENTRY_ENVIRONMENT?: string;
  }
}
