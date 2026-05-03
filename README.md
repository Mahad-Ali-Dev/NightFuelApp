# 🌙 NightFuel

> **Chrono-Nutrition & Fitness Platform for Shift Workers**
> Production-grade microservices monorepo — TypeScript + Python + Next.js 15

[![Build](https://img.shields.io/badge/build-18%2F18%20passing-brightgreen)](#)
[![Services](https://img.shields.io/badge/microservices-14-blue)](#architecture)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6)](#tech-stack)
[![Python](https://img.shields.io/badge/Python-3.12-yellow)](#tech-stack)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](#tech-stack)

---

## What is NightFuel?

NightFuel is a **chrono-nutrition and fitness platform** built specifically for people who work nights, rotating shifts, or irregular hours. Standard fitness apps assume a 9-to-5 lifestyle — NightFuel doesn't.

It syncs meal timing, workout scheduling, caffeine guidance, and sleep optimisation to each user's **unique circadian rhythm**.

### Core Differentiators

| Feature | Description |
|---------|-------------|
| 🕐 Reverse meal-timing | Meals scheduled around your sleep window, not the clock |
| 🧠 Circadian-aware AI | Python deterministic engine + Claude (Sonnet/Haiku) for personalised plans |
| 🌙 Night-shift first | Caffeine windows, fatigue tracking, sleep-cycle management |
| 🥗 Dual food database | Open Food Facts (3M+ foods, online) + NightFuel Library (760 whole foods, offline) |
| 🏋️ Smart workouts | Intensity auto-adjusted by fatigue, shift hours, and sleep quality |
| 🤝 Coach marketplace | Certified coaches can manage clients, create plans, and chat |
| 🕌 Ramadan Mode | Active fasting schedule adjustments tailored for Suhoor and Iftar |

> **Update:** As of the latest production release, the application is fully backend-integrated. All mock data (Community feed, Messages/Chat sockets, and Workout Sessions) has been replaced by live PostgreSQL + Redis microservices.

---

## Architecture

```
nightfuel/
├── services/
│   ├── auth-service/           :3001  Node/Fastify — JWT auth, sessions
│   ├── shift-service/          :3002  Node/Fastify — Shift scheduling & rotation
│   ├── circadian-engine/       :3003  Python/FastAPI — Deterministic circadian model
│   ├── ai-pipeline/            :3004  Python/FastAPI — Claude API, structured plans
│   ├── plan-service/           :3005  Node/Fastify — Day plans, meal windows
│   ├── meal-service/           :3006  Node/Fastify — Food logs, recipes, fasting, FoodDB
│   ├── progress-service/       :3007  Node/Fastify — Body metrics, streaks, reports
│   ├── notification-service/   :3008  Node/Fastify — Push notifications
│   ├── user-service/           :3009  Node/Fastify — Profiles, onboarding, preferences
│   ├── sleep-service/          :3010  Node/Fastify — Sleep logs, quality scoring
│   ├── exercise-service/       :3011  Node/Fastify — Workouts, ExerciseDB, 1RM
│   ├── subscription-service/   :3012  Node/Fastify — Stripe billing, tiers
│   ├── community-service/      :3013  Node/Fastify — Forums, challenges
│   └── chat-service/           :3014  Node/Fastify — Coach chat (WS), AI assistant
│
├── packages/
│   ├── @nightfuel/types/       Shared TypeScript interfaces
│   ├── @nightfuel/events/      Redis Pub/Sub EventBus abstraction
│   └── @nightfuel/config/      Pino logger, Zod env validation
│
├── clients/
│   ├── web/                    Next.js 15 (App Router)
│   └── mobile/                 React Native + Expo SDK 52 (TBD)
│
└── infra/
    └── docker/docker-compose.yml
```

### Design Principles

1. **One Service, One Concern** — no God services; each service owns its own DB schema
2. **Events Over HTTP** — async Redis Pub/Sub for inter-service communication via `@nightfuel/events`
3. **Shared Types, Separate Data** — `@nightfuel/types` is the contract; cross-service joins are forbidden
4. **Docker Compose Parity** — local dev mirrors Railway production exactly
5. **Clear Scale Path** — EventBus abstraction supports Redis → Kafka upgrade without service changes

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend runtime** | Node.js 22 LTS + Fastify 5 |
| **Language** | TypeScript 5.5+ (strict, `noUncheckedIndexedAccess`) |
| **Monorepo tooling** | Turborepo + npm workspaces |
| **Database** | PostgreSQL 16 via Supabase + Prisma 6 ORM |
| **Cache / Event bus** | Redis 7 via Upstash + ioredis |
| **AI — Layer 1** | Python 3.12 + numpy (deterministic circadian model) |
| **AI — Layer 2** | Rule-based chrono-nutrition engine |
| **AI — Layer 3** | Anthropic Claude API — Sonnet 4.5 / Haiku |
| **Web client** | Next.js 15 App Router + Tailwind CSS + Framer Motion |
| **Mobile client** | React Native + Expo SDK 52 + NativeWind |
| **State management** | TanStack Query (server) + Zustand (client) |
| **Auth** | JWT via `@fastify/jwt` + HTTP-only session cookie |
| **Containerisation** | Docker + Docker Compose |
| **Deployment** | Railway |

---

## Quick Start

### Prerequisites

- Node.js 22 LTS
- Python 3.12
- Docker Desktop
- npm 10+

### 1. Install

```bash
git clone <repo-url>
cd nightfuel
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — add JWT_SECRET, Supabase DB URLs, Redis URL, Anthropic API key
```

### 3. Start all services

```bash
# All services + infra via Docker Compose
docker-compose -f infra/docker/docker-compose.yml up

# OR start services individually in dev mode
npm run dev
```

### 4. First-time database setup

```bash
cd services/meal-service
npx prisma migrate deploy   # apply all migrations — SAFE, no data loss
npm run seed:foodb           # seed 760 whole foods (FoodDB)
npm run seed:recipes         # seed sample recipes
```

> ⚠️ **Always use `db:deploy`, never `prisma db push`** — `db push` drops tables on large drift.

---

## Environment Variables

See `.env.example` at the repo root for the full list. Key variables:

```env
# Auth
JWT_SECRET=change-me-in-production

# Databases (one per service — Supabase connection strings)
MEAL_DATABASE_URL=postgresql://...@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres

# Redis (Upstash)
REDIS_URL=rediss://...

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Inter-service URLs
PLAN_SERVICE_URL=http://localhost:3005
MEAL_SERVICE_URL=http://localhost:3006
```

---

## Available Scripts

### Root (runs across all packages via Turborepo)

```bash
npm run dev          # Start all services in watch mode
npm run build        # Build all packages and services
npm run lint         # ESLint entire monorepo
npm run format       # Prettier formatting
npm run check-types  # TypeScript type-check all packages
```

### Per-service (run inside `services/<name>/`)

```bash
npm run dev          # Start with nodemon (hot reload)
npm run build        # tsc → dist/
npm run db:migrate   # Create new migration (dev)
npm run db:deploy    # Apply pending migrations (production)
npm run db:generate  # Regenerate Prisma client
npm run db:studio    # Visual DB browser (Prisma Studio)
```

### Meal-service specific

```bash
npm run seed:foodb   # Seed 760 whole foods from FoodDB
npm run seed:recipes # Seed sample recipes
```

---

## API Reference

All backend services are proxied through the Next.js web client:

| Web prefix | Service | Port |
|------------|---------|------|
| `/api/auth/*` | auth-service | 3001 |
| `/api/shifts/*` | shift-service | 3002 |
| `/api/circadian/*` | circadian-engine | 3003 |
| `/api/ai/*` | ai-pipeline | 3004 |
| `/api/plans/*` | plan-service | 3005 |
| `/api/meals/*` | meal-service | 3006 |
| `/api/progress/*` | progress-service | 3007 |
| `/api/exercises/*` | exercise-service | 3011 |
| `/api/community/*` | community-service | 3013 |
| `/api/chat/*` | chat-service | 3014 |

### meal-service endpoints

```
GET  /api/meals/search?q=kale&foodGroup=Vegetables&isVegan=true&limit=20
GET  /api/meals/food/:id
GET  /api/meals/food-groups
POST /api/meals/log          { mealType, foodItems[] }
GET  /api/meals/logs?date=2026-02-26
GET  /api/meals/grocery-list?date=2026-02-26
GET  /api/meals/recipes?tags=highprotein
POST /api/meals/recipes      { title, ingredients[], instructions[], ... }
GET  /api/meals/fasting
POST /api/meals/fasting/start  { targetHours: 16 }
POST /api/meals/fasting/end
```

---

## Food Search: Online vs Library

The meal logger at `/dashboard/meals` has a toggle in the top-right:

```
[ 🌐 Online ]  [ 🥗 Library ]
```

| | 🌐 Online (Open Food Facts) | 🥗 Library (NightFuel) |
|---|---|---|
| **Foods** | 3M+ branded & packaged foods | 760 whole/natural foods |
| **Data** | Full micronutrients + barcode | Macros, fiber, sugar, sodium |
| **Dietary tags** | Brand info | 🌱 Vegan · 🌾 GF · ☪ Halal |
| **Region filter** | 🌍 World / 🇵🇰 PK / 🇮🇳 IN / 🇺🇸 US… | Global |
| **Internet** | Required | Offline-capable |

If Online returns no results, a **"Try Library"** button appears automatically.

---

## Database Migrations

Each service has its own migrations folder. The safe workflow:

```bash
# 1. Edit prisma/schema.prisma
# 2. Create migration (generates SQL, applies locally)
npx prisma migrate dev --name add_my_column

# 3. Deploy to production / Supabase
npx prisma migrate deploy
```

### Fixing a failed migration (P3009)

If you see `Error: P3009 — migrate found failed migrations`:

```bash
# Mark the failed migration as resolved (safe when tables already exist)
npx prisma migrate resolve --applied "<migration_timestamp_name>"

# Then re-deploy
npx prisma migrate deploy
```

---

## Security

- JWT auth on every service endpoint (`preHandler: [authenticate]`)
- Route protection via Next.js `proxy.ts` — checks `nf_auth` HTTP-only cookie
- SSRF protection on food-search proxy — `ALLOWED_REGIONS` allowlist
- Strict CSP headers in `next.config.js` (no external script sources)
- HSTS: `max-age=63072000; includeSubDomains; preload`
- Rate limiting: 100 req/min per service instance
- Helmet security headers on all Fastify services

---

## Project Documentation

See [`docs/NightFuel-Project-Doc.md`](docs/NightFuel-Project-Doc.md) for the full project design document including feature specs, data models, AI architecture, and deployment guide.

---

## License

MIT © NightFuel
