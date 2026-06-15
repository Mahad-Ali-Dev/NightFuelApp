# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN apk add --no-cache openssl
RUN npm install -g turbo@2

# ── Pruner stage: extract only exercise-service and its workspace deps ────────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune exercise-service --docker

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

# Generate Prisma client targeting the exercise-service schema
RUN npx --workspace=exercise-service prisma generate

# Build TypeScript
RUN turbo run build --filter=exercise-service

# ── Runner stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=installer /app /app
WORKDIR /app/services/exercise-service
EXPOSE 3011
# The hand-written migrations are incomplete (they ALTER a non-existent
# `workouts` table and omit workout_sessions/exercise_logs). Sync from the
# schema instead so a fresh DB gets the full, correct set of tables.
CMD ["sh", "-c", "npx prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss && node dist/index.js"]
