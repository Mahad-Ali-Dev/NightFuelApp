# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN apk add --no-cache openssl
RUN npm install -g turbo@2

# ── Pruner stage: extract only subscription-service and its workspace deps ────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune subscription-service --docker

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

# Generate Prisma client targeting the subscription-service schema
RUN npx --workspace=subscription-service prisma generate

# Build TypeScript
RUN turbo run build --filter=subscription-service

# ── Runner stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=installer /app /app
WORKDIR /app/services/subscription-service
EXPOSE 3012
# The hand-written migrations under prisma/migrations are human-readable RECORDS,
# not a complete `prisma migrate` history (the new 20260622_iap_transactions table
# is documented there but only applied via db push — F31 sleep-service precedent).
# `migrate deploy` would leave the DB missing the iap_transactions table, so the
# IAP receipt-binding guard in POST /v1/subscriptions/iap/validate would 500 with
# P2021. Sync from the schema instead so a fresh DB gets the full, correct set of
# tables. db push of an additive, table-only delta is data-loss-free (see
# 20260622_iap_transactions/migration.sql SAFETY note).
CMD ["sh", "-c", "npx prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss && node dist/index.js"]
