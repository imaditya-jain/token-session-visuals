# Security review (OWASP ASVS 4.0 Level 2)

Honest self-assessment by the developer, **not** an independent audit or certification. Status: **Met**, **Partial**, **Gap**, **N/A**.
Evidence is code or an automated test; the API contract suite (`e2e/api.spec.ts`) exercises hostile input over real HTTP.

| Area | Status | Notes / evidence |
|---|---|---|
| V1 Architecture | Partial | Server-only modules, thin routes, no public catalog API. No formal threat model document (this file is the closest). |
| V2 Authentication | Met, with notes | argon2id; generic errors; 5-strike/15-min lockout; rate limits per IP and account; rotating refresh tokens with replay detection (family revoked); password reset signs out everywhere. **Gap:** no MFA (L2 expects it as an option); no breached-password check; password policy is length-based only. |
| V3 Session management | Met | Opaque 256-bit refresh token, stored only as keyed hash, httpOnly/Secure/SameSite=Strict, path-scoped; short-lived access JWT in memory only; role read from DB each request; logout and logout-all work server-side; 30-day absolute cap. |
| V4 Access control | Met | Every `/api/*` needs Bearer except register/login/refresh/reset/newsletter/contact/webhooks/health; data scoped by `userId` from the token; foreign order ids return 404; orders require a verified email. Contract tests cover it. |
| V5 Validation, sanitization | Met | zod on every input, control-character rejection, NoSQL-operator and prototype-pollution tests, Shopify search syntax cannot be injected, policy HTML re-sanitized with an allow-list, JSON-LD escapes `<`. |
| V6 Cryptography | Met | Standard primitives only (HMAC-SHA256, argon2id, HS256 JWT via `jose`), timing-safe comparisons, secrets from env with minimum length. **Note:** one secret (`REFRESH_TOKEN_SECRET`) keys several purposes via domain-separated inputs; rotation impact is documented in RUNBOOKS. |
| V7 Error handling, logging | Partial | Generic errors, request ids, no stack traces to clients, Sentry with PII scrubbing. **Gap:** no centralized audit log of security events (logins, resets) beyond application logs; no log retention policy. |
| V8 Data protection | Met | Data export and deletion with password re-check; order mirror stores no email/address/phone; responses `no-store` for private data; Sentry collects no cookies/bodies/queries. **Gap:** MongoDB Atlas M0 has no encryption-key control and no backups (see RUNBOOKS 4). |
| V9 Communications | Met | HSTS, HTTPS-only cookies in production, same-origin `connect-src`. TLS is terminated by the host. |
| V10 Malicious code | Met | Exact-pinned dependencies, `npm audit` and gitleaks in CI, Dependabot. No dynamic code; no `eval` in production. |
| V11 Business logic | Partial | Idempotent webhooks/jobs, quantity limits, stock errors. Checkout, payments and fraud checks belong to Shopify's hosted checkout. |
| V12 Files | N/A | No uploads. |
| V13 API | Met | Envelope, correct status codes, method checks, Origin (CSRF) check on mutations, rate limits, HMAC-verified webhooks. |
| V14 Configuration | Partial | Hardened headers and CSP; env validated at startup. **Known weakening:** CSP allows `'unsafe-inline'` for scripts (Next's inline bootstrap cannot be hashed; nonces would make pages dynamic). Mitigated by no third-party origins, `object-src 'none'`, strict sanitization. Revisit if pages become dynamic anyway. |

## Open items, by priority

1. **Backups** for MongoDB before real customers (RUNBOOKS 4).
2. **MFA / breached-password check** (ASVS L2 V2).
3. **Security-event audit log** (V7).
4. **Shopify mandatory GDPR webhooks** are not needed for a custom app but would be if it ever becomes a public app.
5. **Independent penetration test** before large-scale launch; this document is a self-review.
6. Color-contrast and CSP-nonce items are owner design/architecture decisions recorded in CLAUDE.md.
