# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN apk add --no-cache openssl
RUN npm install -g turbo@2

# ── Pruner stage: extract only user-service and its workspace deps ────────────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune user-service --docker

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

# Generate Prisma client targeting the user-service schema
RUN npx --workspace=user-service prisma generate

# Build TypeScript
RUN turbo run build --filter=user-service

# ── Runner stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=installer /app /app
WORKDIR /app/services/user-service
EXPOSE 3009
# The hand-written migrations are incomplete (they omit columns the schema has,
# e.g. user_profiles.region), so `migrate deploy` leaves the DB out of sync with
# the Prisma schema and queries fail with P2022. Sync from the schema instead so a
# fresh DB gets the full, correct set of columns/tables.
CMD ["sh", "-c", "npx prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss && node dist/index.js"]
