# Falcon frontend — use this Dockerfile (not Nixpacks). Coolify: Build Pack = Dockerfile, Base Directory = frontend
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine
FROM ${NODE_IMAGE} AS builder

WORKDIR /app

ENV NODE_ENV=development
ENV npm_config_production=false
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

# Production stage — Next.js standalone output (no full node_modules copy)
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine
FROM ${NODE_IMAGE} AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
