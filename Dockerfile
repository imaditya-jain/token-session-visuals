# syntax=docker/dockerfile:1.7
#
# Production image for the storefront (self-hosting; Vercel does not use this file).
#
#   docker build -t fernwood .
#   # Optional: bake a fresh Shopify catalog into the static pages. The secret is mounted for the build step only
#   # and never stored in an image layer. The file holds plain KEY=value lines (SHOPIFY_STORE_URL, tokens, SITE_URL).
#   docker build --secret id=build_env,src=.env.build -t fernwood .
#
# Runtime configuration comes from environment variables (see .env.example); nothing secret is built in.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Reproducible install from the lockfile (npm ci); argon2's native binary is fetched for this platform.
RUN --mount=type=cache,target=/root/.npm npm ci

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
# Public values that are inlined into the build (not secrets).
ARG SITE_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ENV SITE_URL=${SITE_URL} NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=secret,id=build_env,required=false \
    sh -c 'if [ -f /run/secrets/build_env ]; then set -a; . /run/secrets/build_env; set +a; fi; npm run build'

FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Least privilege: the server runs as an unprivileged user with no shell login and no home directory.
RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app --no-create-home --shell /usr/sbin/nologin app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
# Liveness only (no database or Shopify call), so a dependency outage never restarts a healthy container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
