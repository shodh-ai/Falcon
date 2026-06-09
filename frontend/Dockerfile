# Optional — Coolify should use Nixpacks (see nixpacks.toml). Base Directory: frontend
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine
FROM ${NODE_IMAGE} AS builder

WORKDIR /app

ENV npm_config_production=false
ENV NODE_OPTIONS=--max-old-space-size=4096

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN NODE_ENV=production npm run build

ARG NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine
FROM ${NODE_IMAGE} AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY next.config.ts ./

EXPOSE 3000

CMD ["npm", "start"]
