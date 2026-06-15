FROM node:22-alpine AS base
RUN apk add --no-cache openssl
RUN npm install -g turbo@^2

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune plan-service --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN npm install

FROM installer AS builder
WORKDIR /app
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.json ./tsconfig.json
RUN turbo run build --filter=plan-service

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=builder /app /app
WORKDIR /app/services/plan-service
EXPOSE 3005
# The committed migrations are incomplete (they omit columns the schema has, e.g.
# day_plans.protocol_id), so `migrate deploy` leaves the DB out of sync → P2022 at
# query time. Sync from the schema instead, matching user-/exercise-service.
CMD ["sh", "-c", "npx prisma db push --schema=prisma/schema.prisma --skip-generate --accept-data-loss && node dist/index.js"]
