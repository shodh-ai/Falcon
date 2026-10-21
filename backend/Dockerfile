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
ENV HOME=/tmp
ENV XDG_CACHE_HOME=/tmp/falcon-cache

COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/data ./data

# PDF-to-CSV department preparation is an offline build/ops task. Production
# bootstrap consumes committed CSV files with --skip-parse, so shipping Python,
# pip and pypdf in every API image only increases deploy/unpack pressure.
RUN addgroup -g 61001 -S falcon \
    && adduser -S -D -H -u 61001 -G falcon -h /tmp -s /sbin/nologin falcon \
    && mkdir -p /app/uploads \
    && find / -xdev -type f \( -perm -4000 -o -perm -2000 \) -exec chmod u-s,g-s {} + \
    && chmod -R a-w /app \
    && chown 61001:61001 /app/uploads \
    && chmod 0750 /app/uploads

USER 61001:61001

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=5 \
  CMD node scripts/healthcheck.js

# Verify existing storage and database boundaries before starting the API.
# Migrations use a separately reviewed one-off job, never container startup.
# Code remains root-owned and has no write bits. Existing persistent uploads
# need separately preserved and reviewed ACLs before this UID is deployed.
CMD ["node", "scripts/runtime-start.cjs"]
