# Coolify: Base Directory = frontend, Build Pack = Dockerfile
#
# Coolify env vars:
#   NODE_ENV, NPM_CONFIG_PRODUCTION — runtime only (not build-time)
#   NEXT_PUBLIC_* — must be available at BUILD time (Coolify injects as ARG)
FROM node:20-bookworm-slim AS builder

WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ARG NEXT_PUBLIC_SAAS_BASE_DOMAIN
ARG NEXT_PUBLIC_DEFAULT_TENANT_SUBDOMAIN

# Native deps for sharp / Next.js on Linux
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./

# env -i clears Coolify build-time NODE_ENV / NPM_CONFIG_PRODUCTION injection
RUN env -i \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    HOME="/root" \
    NODE_ENV=development \
    NODE_OPTIONS="--max-old-space-size=4096" \
    npm ci --include=dev --no-audit --no-fund

COPY . .

RUN env -i \
    PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    HOME="/root" \
    NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=4096" \
    NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL}" \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID="${NEXT_PUBLIC_GOOGLE_CLIENT_ID}" \
    NEXT_PUBLIC_SAAS_BASE_DOMAIN="${NEXT_PUBLIC_SAAS_BASE_DOMAIN}" \
    NEXT_PUBLIC_DEFAULT_TENANT_SUBDOMAIN="${NEXT_PUBLIC_DEFAULT_TENANT_SUBDOMAIN}" \
    npm run build

FROM node:20-bookworm-slim AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
