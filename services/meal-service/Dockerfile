FROM node:22-alpine AS base
RUN npm install -g turbo@^2

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune meal-service --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN npm ci

FROM installer AS builder
WORKDIR /app
COPY --from=pruner /app/out/full/ .
RUN npm run build --workspace=meal-service

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/services/meal-service/dist ./dist
COPY --from=builder /app/services/meal-service/prisma ./prisma
COPY --from=builder /app/services/meal-service/src/generated ./src/generated
COPY --from=builder /app/services/meal-service/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3006
CMD ["sh", "-c", "npx prisma migrate deploy --schema=prisma/schema.prisma && node dist/index.js"]
