# Coolify: Base Directory = backend, Build Pack = Dockerfile
#
# Coolify env vars:
#   NODE_ENV, NPM_CONFIG_PRODUCTION — runtime only (not build-time)
ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS builder

WORKDIR /app

# Native deps for bcrypt / node-gyp on Alpine
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json .npmrc ./

# env -i clears Coolify build-time NODE_ENV / NPM_CONFIG_PRODUCTION injection
RUN env -i \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    HOME="/root" \
    NODE_ENV=development \
    NODE_OPTIONS="--max-old-space-size=2048" \
    npm ci --include=dev --no-audit --no-fund

COPY . .

RUN env -i \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    HOME="/root" \
    NODE_ENV=development \
    NODE_OPTIONS="--max-old-space-size=2048" \
    npm run build \
    && npm prune --omit=dev

# Production stage — reuse pruned node_modules from builder (avoids a second full npm ci)
ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS production

WORKDIR /app

LABEL org.opencontainers.image.source="https://github.com/shodh-ai/Falcon" \
      org.opencontainers.image.description="Falcon API service" \
      org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production
ENV PORT=4000
ENV NODE_OPTIONS=--max-old-space-size=768

COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/data ./data

# PDF-to-CSV department preparation is an offline build/ops task. Production
# bootstrap consumes committed CSV files with --skip-parse, so shipping Python,
# pip and pypdf in every API image only increases deploy/unpack pressure.
RUN mkdir -p /app/uploads && chown node:node /app/uploads

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=5 \
  CMD node scripts/healthcheck.js

# Verify existing storage and database boundaries before starting the API.
# Migrations use a separately reviewed one-off job, never container startup.
# First rollout preserves the current OS identity; non-root/ACL adoption is a
# separate stage after the migration-free rollback image is verified healthy.
CMD ["node", "scripts/runtime-start.cjs"]
