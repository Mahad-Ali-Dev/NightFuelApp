# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN apk add --no-cache openssl
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
COPY --from=pruner /app/tsconfig.json ./tsconfig.json

# Generate Prisma client targeting the community-service schema
RUN npx --workspace=community-service prisma generate

# Build TypeScript
RUN turbo run build --filter=community-service

# ── Runner stage ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=installer /app /app
WORKDIR /app/services/community-service
EXPOSE 3013
CMD ["sh", "-c", "npx prisma migrate deploy --schema=prisma/schema.prisma && node dist/index.js"]
