# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN apk add --no-cache openssl
RUN npm install -g turbo@2

# ── Pruner stage: extract only sleep-service and its workspace deps ───────────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune sleep-service --docker

# ── Installer stage: install pruned dependencies ──────────────────────────────
FROM base AS installer
WORKDIR /app

# Copy pruned lockfile + package manifests
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

RUN npm install

# Copy pruned source files
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.json ./tsconfig.json

# Generate Prisma client targeting the sleep-service schema
RUN npx --workspace=sleep-service prisma generate

# Build TypeScript
RUN turbo run build --filter=sleep-service

# ── Runner stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=installer /app /app
WORKDIR /app/services/sleep-service
EXPOSE 3010
# The hand-written migrations under prisma/migrations are human-readable RECORDS,
# not a complete `prisma migrate` history (the new 20260621_health_samples table
# is documented there but only applied via db push — F28 user-service precedent).
# `migrate deploy` would leave the DB missing the health_samples table, so the
# new POST /v1/sleep/health-sync would 500 with P2021. Sync from the schema
# instead so a fresh DB gets the full, correct set of columns/tables. db push of
# an additive, table-only delta is data-loss-free (see migration.sql SAFETY note).
CMD ["sh", "-c", "npx prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss && node dist/index.js"]
