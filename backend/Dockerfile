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

ENV NODE_ENV=production
ENV PORT=4000
ENV NODE_OPTIONS=--max-old-space-size=768

COPY --chown=node:node package.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/migrations ./migrations
COPY --chown=node:node --from=builder /app/scripts ./scripts
COPY --chown=node:node --from=builder /app/data ./data

# PDF-to-CSV department preparation is an offline build/ops task. Production
# bootstrap consumes committed CSV files with --skip-parse, so shipping Python,
# pip and pypdf in every API image only increases deploy/unpack pressure.
RUN mkdir -p /app/uploads && chown node:node /app/uploads

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Use explicit .js — `node dist/main` can fail with MODULE_NOT_FOUND on some Node builds
CMD ["node", "dist/main.js"]
