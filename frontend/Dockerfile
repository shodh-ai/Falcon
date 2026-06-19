# Coolify: Base Directory = frontend, Build Pack = Dockerfile
#
# Coolify env vars — set as RUNTIME ONLY (not build-time):
#   NODE_ENV, NPM_CONFIG_PRODUCTION
# Required runtime env on the frontend service:
#   API_URL=https://<your-backend-fqdn>   (no trailing slash)
FROM node:20-bookworm-slim AS builder

WORKDIR /app

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
