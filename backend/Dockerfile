# Build stage — force devDependencies even when Coolify injects NODE_ENV=production at build time
FROM node:20-alpine AS builder

WORKDIR /app

ENV NODE_ENV=development
ENV npm_config_production=false

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

# Production stage — reuse pruned node_modules from builder (avoids a second full npm ci)
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts

RUN mkdir -p /app/uploads

EXPOSE 4000

CMD ["node", "dist/main"]
