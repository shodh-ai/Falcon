# Build stage
# Default to AWS Public ECR (Docker Hub mirror); override with node:20-alpine if your host has reliable Hub access
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine
FROM ${NODE_IMAGE} AS builder

WORKDIR /app

ENV NODE_ENV=development
ENV npm_config_production=false

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# Production stage
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:20-alpine
FROM ${NODE_IMAGE} AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY next.config.js ./

EXPOSE 3000

CMD ["npm", "start"]
