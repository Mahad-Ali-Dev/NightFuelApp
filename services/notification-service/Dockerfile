# ============================================================================
# Stage 1 — deps
# Install all workspace dependencies (including devDependencies needed to
# build TypeScript and run prisma generate).
# ============================================================================
FROM node:22-alpine AS deps

# Install pnpm globally — matches the monorepo toolchain
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace manifests so pnpm can link internal packages
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy shared package manifests
COPY packages/types/package.json        ./packages/types/package.json
COPY packages/events/package.json       ./packages/events/package.json
COPY packages/config/package.json       ./packages/config/package.json

# Copy service manifest
COPY services/notification-service/package.json ./services/notification-service/package.json

# Install all dependencies (includes devDependencies for build)
RUN pnpm install --frozen-lockfile

# ============================================================================
# Stage 2 — builder
# Build shared packages, generate Prisma client, compile TypeScript.
# ============================================================================
FROM deps AS builder

WORKDIR /app

# Copy shared package sources
COPY packages/types/   ./packages/types/
COPY packages/events/  ./packages/events/
COPY packages/config/  ./packages/config/

# Build shared packages in dependency order
RUN pnpm --filter @nightfuel/types build \
    && pnpm --filter @nightfuel/events build \
    && pnpm --filter @nightfuel/config build

# Copy the notification-service source
COPY services/notification-service/ ./services/notification-service/

WORKDIR /app/services/notification-service

# Generate Prisma client (outputs to src/generated/prisma)
RUN pnpm prisma generate

# Compile TypeScript → dist/
RUN pnpm build

# ============================================================================
# Stage 3 — runner (production image)
# Lean final image with only the compiled output and production dependencies.
# ============================================================================
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate

# Non-root user for security
RUN addgroup --system --gid 1001 nightfuel \
    && adduser --system --uid 1001 --ingroup nightfuel notifuser

WORKDIR /app

# Copy workspace-level manifests (needed for pnpm to resolve the workspace)
COPY --from=builder /app/package.json          ./package.json
COPY --from=builder /app/pnpm-workspace.yaml   ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml        ./pnpm-lock.yaml

# Copy shared package build artifacts
COPY --from=builder /app/packages/types/dist   ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/package.json

COPY --from=builder /app/packages/events/dist  ./packages/events/dist
COPY --from=builder /app/packages/events/package.json ./packages/events/package.json

COPY --from=builder /app/packages/config/dist  ./packages/config/dist
COPY --from=builder /app/packages/config/package.json ./packages/config/package.json

# Copy notification-service compiled output and Prisma artefacts
COPY --from=builder /app/services/notification-service/dist              ./services/notification-service/dist
COPY --from=builder /app/services/notification-service/src/generated     ./services/notification-service/src/generated
COPY --from=builder /app/services/notification-service/prisma            ./services/notification-service/prisma
COPY --from=builder /app/services/notification-service/package.json      ./services/notification-service/package.json

# Install production-only dependencies
RUN pnpm install --prod --frozen-lockfile

# Ensure the runtime user owns the application files
RUN chown -R notifuser:nightfuel /app

USER notifuser

WORKDIR /app/services/notification-service

EXPOSE 3008

# Run Prisma migrations then start the service
CMD ["sh", "-c", "node -e \"require('./dist/index.js')\""]
