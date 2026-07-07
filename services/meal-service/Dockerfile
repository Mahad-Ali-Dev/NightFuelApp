FROM node:22-alpine AS base
RUN apk add --no-cache openssl
RUN npm install -g turbo@^2

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune meal-service --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN npm install

FROM installer AS builder
WORKDIR /app
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.json ./tsconfig.json
RUN turbo run build --filter=meal-service

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=builder /app /app
WORKDIR /app/services/meal-service
EXPOSE 3006
CMD ["sh", "-c", "npx prisma migrate deploy --schema=prisma/schema.prisma && node dist/index.js"]
