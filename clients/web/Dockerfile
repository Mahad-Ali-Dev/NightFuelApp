# Monorepo-aware Next.js build via turbo prune (mirrors the backend services)
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN npm install -g turbo@^2

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune web --docker

FROM base AS installer
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json* ./
RUN npm install --legacy-peer-deps

FROM installer AS builder
WORKDIR /app
COPY --from=pruner /app/out/full/ .
ARG NEXT_PUBLIC_API_URL=http://nginx/api
ARG NEXT_PUBLIC_WS_URL=ws://nginx
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN turbo run build --filter=web

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app /app
WORKDIR /app/clients/web
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["npx", "next", "start", "--port", "3000"]
