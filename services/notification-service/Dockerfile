# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN npm install -g turbo@2

# ── Pruner stage: extract only notification-service and its workspace deps ────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune notification-service --docker

# ── Installer stage: install pruned dependencies ──────────────────────────────
FROM base AS installer
WORKDIR /app

# Copy pruned lockfile + package manifests
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

RUN npm install

# Copy pruned source files
COPY --from=pruner /app/out/full/ .

# Generate Prisma client targeting the notification-service schema
RUN npx --workspace=notification-service prisma generate

# Build TypeScript
RUN turbo run build --filter=notification-service

# ── Runner stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy built output and runtime node_modules
COPY --from=installer --chown=appuser:appgroup /app/services/notification-service/dist ./dist
COPY --from=installer --chown=appuser:appgroup /app/services/notification-service/node_modules ./node_modules
COPY --from=installer --chown=appuser:appgroup /app/node_modules ./root_node_modules
COPY --from=installer --chown=appuser:appgroup /app/services/notification-service/prisma ./prisma

USER appuser

EXPOSE 3008

# Run Prisma migrations then start the service
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
