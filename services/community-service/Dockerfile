# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN npm install -g turbo@2

# ── Pruner stage: extract only community-service and its workspace deps ─────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune community-service --docker

# ── Installer stage: install pruned dependencies ────────────────────────────
FROM base AS installer
WORKDIR /app

# Copy pruned lockfile + package manifests
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

RUN npm install

# Copy pruned source files
COPY --from=pruner /app/out/full/ .

# Generate Prisma client targeting the community-service schema
RUN npx --workspace=community-service prisma generate

# Build TypeScript
RUN turbo run build --filter=community-service

# ── Runner stage ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy built output and runtime node_modules
COPY --from=installer --chown=appuser:appgroup /app/services/community-service/dist ./dist
COPY --from=installer --chown=appuser:appgroup /app/services/community-service/node_modules ./node_modules
COPY --from=installer --chown=appuser:appgroup /app/node_modules ./root_node_modules
COPY --from=installer --chown=appuser:appgroup /app/services/community-service/prisma ./prisma

USER appuser

EXPOSE 3013

# Run Prisma migrations then start the service
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
