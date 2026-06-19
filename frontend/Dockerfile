# Coolify: Base Directory = frontend, Build Pack = Dockerfile (not Nixpacks).
# Nixpacks copies the full source tree after build and often fails on "exporting layers"
# when disk is tight; this multi-stage standalone image is much smaller (~200 MB vs ~1 GB+).
ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS builder

WORKDIR /app

ENV npm_config_production=false
ENV NODE_OPTIONS=--max-old-space-size=4096

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN NODE_ENV=production npm run build

ARG NODE_IMAGE=node:20-alpine
FROM ${NODE_IMAGE} AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
