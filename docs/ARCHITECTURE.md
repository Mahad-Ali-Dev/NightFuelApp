# NightFuel — Complete Architecture & Deployment Guide

> **Version:** 2.0 | **Date:** 2026-02-26 | **Stack:** Node 22 · Fastify 5 · Next.js 15 · Python 3.12 · PostgreSQL 16 · Redis 7

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Monorepo Structure](#3-monorepo-structure)
4. [Services Catalogue](#4-services-catalogue)
5. [Data Architecture](#5-data-architecture)
6. [Event-Driven Communication](#6-event-driven-communication)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Frontend Architecture](#8-frontend-architecture)
9. [AI Pipeline](#9-ai-pipeline)
10. [Push Notifications](#10-push-notifications)
11. [Payments & Subscriptions](#11-payments--subscriptions)
12. [Database Schema Summary](#12-database-schema-summary)
13. [API Reference](#13-api-reference)
14. [Infrastructure & Deployment](#14-infrastructure--deployment)
15. [Environment Variables](#15-environment-variables)
16. [Development Workflow](#16-development-workflow)

---

## 1. Product Overview

**NightFuel** is a chrono-nutrition and fitness platform purpose-built for **shift workers** (night workers, rotating schedule workers). It addresses the unique metabolic and circadian challenges of irregular sleep schedules with:

- **Circadian-aware meal timing** — meals, fasts, and macros scheduled around the user's actual sleep window, not a conventional 9-to-5.
- **AI nutrition & workout planning** — three-layer AI (deterministic → rule-based → LLM) generates personalized, budget-conscious, acne-safe plans.
- **Night shift optimization** — caffeine timing guidance, reverse meal timing planner, energy management.
- **Sleep & habit tracking** — logs, wearable integrations (Oura, Garmin, Apple Watch), weekly AI performance reports.
- **Coach marketplace** — coaches can manage clients, build custom plans, and communicate via real-time chat.
- **Community** — forums, challenges, progress sharing.
- **Subscription tiers** — FREE / PRO / PREMIUM with Stripe-powered billing.

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                │
│  ┌─────────────────────────┐    ┌──────────────────────────────┐   │
│  │  Web (Next.js 15)        │    │  Mobile (React Native / Expo) │   │
│  │  Port 3000               │    │  Expo SDK 52+                 │   │
│  └──────────┬──────────────┘    └───────────────┬──────────────┘   │
└─────────────┼──────────────────────────────────┼────────────────────┘
              │ HTTPS                             │ HTTPS
              ▼                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       API GATEWAY (nginx)                           │
│                         Port 80 / 443                               │
│  Routes:  /api/auth → :3001 │ /api/shifts → :3002 │ ...           │
│           WebSocket upgrades for notification-service (:3008)       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
          ┌────────────────────┼──────────────────────┐
          ▼                    ▼                       ▼
┌─────────────────┐  ┌──────────────────┐  ┌─────────────────────┐
│  Node/Fastify   │  │  Node/Fastify    │  │   Python/FastAPI    │
│  Services       │  │  Services        │  │   Services          │
│  (10 total)     │  │  (cont.)         │  │   (2 total)         │
└────────┬────────┘  └────────┬─────────┘  └──────────┬──────────┘
         │                    │                        │
         └────────────────────┼────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌────────────┐  ┌─────────────┐  ┌──────────────┐
       │ PostgreSQL │  │   Redis 7   │  │  External    │
       │ (Supabase) │  │  (Upstash)  │  │  APIs        │
       │ 13 DBs     │  │  Pub/Sub    │  │  Stripe,VAPID│
       └────────────┘  └─────────────┘  └──────────────┘
```

### Core Design Principles

| Principle | Implementation |
|-----------|----------------|
| **One Service, One Concern** | 12 microservices, each with its own DB and schema |
| **Shared Types, Separate Data** | `@nightfuel/types` package; no cross-service SQL joins |
| **Events Over HTTP** | Redis Pub/Sub via `@nightfuel/events` EventBus |
| **Docker Compose Parity** | Local dev = production Railway topology |
| **Clear Scale Path** | EventBus abstraction allows Kafka migration; UUID cross-service IDs |

---

## 3. Monorepo Structure

```
nightfuel/                          ← Turborepo root
├── clients/
│   ├── web/                        ← Next.js 15 (App Router)
│   │   ├── app/                    ← Route groups
│   │   │   ├── dashboard/          ← Authenticated user pages
│   │   │   ├── admin/              ← Admin moderation (ADMIN role only)
│   │   │   ├── coach/              ← Coach Hub (COACH role)
│   │   │   ├── settings/           ← Profile, subscription, preferences
│   │   │   ├── login/ register/    ← Public auth pages
│   │   │   └── onboarding/         ← Multi-step onboarding flow
│   │   ├── components/             ← Shared UI components
│   │   ├── context/                ← AuthContext, QueryProvider
│   │   ├── lib/                    ← Utilities (cn, api client)
│   │   └── store/                  ← Zustand stores
│   └── mobile/                     ← React Native / Expo (TBD)
│
├── services/
│   ├── auth-service/               ← JWT auth, registration, login  :3001
│   ├── shift-service/              ← Shift schedules, sleep windows  :3002
│   ├── circadian-engine/           ← Python: deterministic models    :3003
│   ├── ai-pipeline/                ← Python: LLM planning            :3004
│   ├── plan-service/               ← Workout/nutrition plan CRUD     :3005
│   ├── meal-service/               ← Meal logs, macros, food search  :3006
│   ├── progress-service/           ← Measurements, photos, reports   :3007
│   ├── notification-service/       ← In-app + push notifications     :3008
│   ├── user-service/               ← Profiles, onboarding            :3009
│   ├── sleep-service/              ← Sleep logs, wearable sync       :3010
│   ├── exercise-service/           ← Exercise library, routines      :3011
│   ├── subscription-service/       ← Tiers, Stripe billing           :3012
│   ├── community-service/          ← Forums, challenges              :3013
│   └── chat-service/               ← Coach ↔ client real-time chat   :3014
│
├── packages/
│   ├── @nightfuel/types/           ← Shared TypeScript interfaces
│   ├── @nightfuel/events/          ← EventBus (Redis Pub/Sub) + schemas
│   └── @nightfuel/config/          ← Shared pino logger, env validation
│
├── infra/
│   └── docker/
│       ├── docker-compose.yml      ← Full local stack
│       ├── nginx/nginx.conf        ← Reverse proxy config
│       └── postgres/init-scripts/  ← DB creation scripts
│
├── db/
│   ├── *.sql                       ← Prisma-generated schema dumps (UTF-16)
│   └── migrations/                 ← Manual migration SQL files
│
├── services/db/                    ← Human-readable full schema files
│   └── *.sql
│
├── docs/                           ← This documentation
├── .env.example                    ← All env vars with placeholder values
├── turbo.json                      ← Turborepo pipeline config
└── package.json                    ← Workspace root
```

---

## 4. Services Catalogue

### 4.1 Node/Fastify Services

#### `auth-service` `:3001`
Handles user registration, login, JWT issuance, and refresh.
- **Routes:** `POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/refresh`, `POST /v1/auth/logout`
- **Events published:** `nightfuel:auth:user-registered`
- **DB:** `nightfuel_auth` (users, refresh_tokens)

#### `shift-service` `:3002`
Manages shift schedules and sleep window calculation.
- **Routes:** `GET/POST/PUT /v1/shifts`, `GET /v1/shifts/current`, `GET /v1/shifts/upcoming`
- **Events published:** `nightfuel:shift:schedule-updated`
- **DB:** `nightfuel_shifts` (shifts, shift_templates)

#### `plan-service` `:3005`
Creates, stores, and retrieves AI-generated workout/nutrition plans.
- **Routes:** `GET/POST /v1/plans`, `POST /v1/plans/generate`, `PUT /v1/plans/:id`
- **Calls:** `ai-pipeline` (HTTP, 3s timeout)
- **DB:** `nightfuel_plans` (plans, plan_items)

#### `meal-service` `:3006`
Food logging, macro tracking, recipe management, food search.
- **Routes:** `GET/POST /v1/meals`, `GET /v1/meals/macros`, `GET /v1/foods/search`, `GET/POST /v1/recipes`
- **External:** OpenFoodFacts API (public, no key required)
- **DB:** `nightfuel_meals` (meal_logs, foods, recipes, grocery_lists)

#### `notification-service` `:3008`
In-app notification inbox + real-time delivery via Socket.IO + Web/Expo push.
- **Routes:**
  - `GET /v1/notifications` — list inbox
  - `PUT /v1/notifications/:id/read` — mark read
  - `PUT /v1/notifications/read-all` — mark all read
  - `GET/PUT /v1/notifications/preferences` — quiet hours, toggles
  - `GET /v1/notifications/push/vapid-key` — VAPID public key (public)
  - `POST /v1/notifications/push/subscribe` — register web push
  - `POST /v1/notifications/push/subscribe/expo` — register Expo token
  - `DELETE /v1/notifications/push/unsubscribe` — remove subscription
- **Real-time:** Socket.IO rooms (`user:<userId>`) — clients join on connect
- **Events consumed:** `nightfuel:auth:user-registered`, `nightfuel:plan:ready`, `nightfuel:shift:schedule-updated`
- **DB:** `nightfuel_notifications` (notifications, notification_preferences, push_subscriptions)

#### `user-service` `:3009`
User profile, onboarding, BMI/BMR/TDEE calculations.
- **Routes:** `GET/PUT /v1/users/profile`, `POST /v1/users/onboarding`, `GET /v1/users/stats`
- **Events consumed:** `nightfuel:auth:user-registered` (creates profile)
- **DB:** `nightfuel_users` (user_profiles, onboarding_state)

#### `progress-service` `:3007`
Weight/measurement tracking, progress photos, AI weekly reports.
- **Routes:** `GET/POST /v1/progress/measurements`, `GET/POST /v1/progress/photos`, `GET/POST /v1/progress/reports`
- **DB:** `nightfuel_progress` (measurements, progress_photos, reports)

#### `exercise-service` `:3011`
Exercise library (seeded from ExerciseDB), custom routines, 1RM calculator.
- **Routes:** `GET /v1/exercises`, `GET /v1/exercises/:id`, `GET/POST /v1/exercises/routines`, `POST /v1/exercises/1rm`
- **DB:** `nightfuel_exercise` (exercises, routines, routine_exercises, exercise_logs)

#### `sleep-service` `:3010`
Sleep log entry, quality scoring, wearable data ingestion.
- **Routes:** `GET/POST /v1/sleep`, `GET /v1/sleep/stats`, `POST /v1/sleep/sync`
- **DB:** `nightfuel_sleep` (sleep_logs — supports source: MANUAL, APPLE_WATCH, OURA, FITBIT, GARMIN)

#### `subscription-service` `:3012`
Subscription tier management, Stripe Checkout, webhook processing.
- **Routes:**
  - `GET /v1/subscriptions/me` — current subscription
  - `GET /v1/subscriptions/limits` — tier limits
  - `PUT /v1/subscriptions/upgrade` — change tier
  - `DELETE /v1/subscriptions/cancel` — cancel at period end
  - `POST /v1/subscriptions/checkout` — create Stripe Checkout Session
  - `POST /v1/subscriptions/webhook` — Stripe webhook receiver
- **Tiers:** FREE → PRO → PREMIUM → ENTERPRISE
- **Events published:** `nightfuel:subscription:tier-updated`
- **Events consumed:** `nightfuel:auth:user-registered` (create FREE subscription)
- **DB:** `nightfuel_subscriptions` (subscriptions, subscription_events)

#### `community-service` `:3013`
Forum posts, comments, challenges, leaderboards.
- **DB:** `nightfuel_community`

#### `chat-service` `:3014`
Real-time coach ↔ client messaging via Socket.IO.
- **DB:** `nightfuel_chat`

---

### 4.2 Python/FastAPI Services

#### `circadian-engine` `:3003`
Deterministic circadian rhythm modeling using NumPy. No LLM calls — pure math.
- **Input:** Sleep schedule, shift times, meal timestamps
- **Output:** Circadian phase score, optimal meal/caffeine/sleep windows
- **Routes:** `POST /v1/circadian/analyze`, `POST /v1/circadian/meal-timing`, `POST /v1/circadian/caffeine`

#### `ai-pipeline` `:3004`
Three-layer AI orchestration:
1. **Layer 1:** Calls `circadian-engine` for deterministic timing data
2. **Layer 2:** Applies chrono-nutrition hard rules (macro ratios, meal gaps, shift-specific patterns)
3. **Layer 3:** Sends a structured JSON skeleton to Claude API (Sonnet 4.6 / Haiku) for final narrative and personalization

- **Routes:** `POST /v1/ai/plan/generate`, `POST /v1/ai/chat`, `POST /v1/ai/report/generate`
- **LLM:** Anthropic Claude API (`claude-sonnet-4-6` / `claude-haiku-4-5-20251001`)
- **Cost control:** Responses are cached in Redis; skeleton-constrained prompts minimize token usage

---

## 5. Data Architecture

### Database Per Service

Each service owns exactly one PostgreSQL logical database. Cross-service references use **UUID strings only** — never foreign keys across databases.

```
nightfuel_auth          ← auth-service
nightfuel_shifts        ← shift-service
nightfuel_plans         ← plan-service
nightfuel_meals         ← meal-service
nightfuel_notifications ← notification-service
nightfuel_users         ← user-service
nightfuel_progress      ← progress-service
nightfuel_exercise      ← exercise-service
nightfuel_sleep         ← sleep-service
nightfuel_subscriptions ← subscription-service
nightfuel_community     ← community-service
nightfuel_chat          ← chat-service
nightfuel_state         ← state-service (session/feature flags)
```

### ORM

All Node services use **Prisma 6** with generated clients (`src/generated/prisma`). Each service runs `npx prisma db push` or `npx prisma migrate deploy` independently.

---

## 6. Event-Driven Communication

Services communicate asynchronously via **Redis Pub/Sub** using the `@nightfuel/events` package.

### EventBus API

```typescript
// Publishing
await eventBus.publish('nightfuel:auth:user-registered', { userId, email });

// Subscribing
eventBus.subscribe('nightfuel:auth:user-registered', async (payload) => {
  await subscriptionService.upsertForNewUser(payload.userId);
});
```

### Registered Event Channels

```
nightfuel:auth:user-registered          → user-service, subscription-service, notification-service
nightfuel:shift:schedule-updated        → notification-service, plan-service
nightfuel:plan:ready                    → notification-service
nightfuel:subscription:tier-updated     → notification-service, user-service
nightfuel:meal:logged                   → progress-service
nightfuel:sleep:logged                  → circadian-engine, progress-service
nightfuel:progress:report-generated     → notification-service
```

### Synchronous HTTP Calls

Used only where a synchronous response is required. Always with:
- 3-second timeout
- Circuit breaker pattern (fail-open with graceful fallback)

```
plan-service → ai-pipeline        (generate plan)
meal-service → meal-service       (food search proxy to OpenFoodFacts)
notification-service → (none)     (all async)
```

---

## 7. Authentication & Authorization

### JWT Flow

```
Client                auth-service              Any Protected Service
  │                        │                           │
  │  POST /api/auth/login  │                           │
  │───────────────────────►│                           │
  │   { accessToken,       │                           │
  │     refreshToken }     │                           │
  │◄───────────────────────│                           │
  │                        │                           │
  │  GET /api/... + Bearer │                           │
  │─────────────────────────────────────────────────► │
  │                        │    fastify.authenticate   │
  │                        │    (jwtVerify preHandler) │
  │                        │                           │
  │◄─────────────────────────────────────────────────  │
```

- **Access token:** 15-minute expiry, signed HS256 with `JWT_SECRET`
- **Refresh token:** 30-day expiry, stored in DB, rotated on use
- **Payload:** `{ userId, email, role, iat, exp }`

### Roles

| Role | Access |
|------|--------|
| `USER` | Standard dashboard, own data |
| `COACH` | Coach Hub, client management |
| `TRAINER` | Coach Hub alias |
| `NUTRITIONIST` | Coach Hub alias |
| `ADMIN` | `/admin` panel, user ban, broadcast notifications |

### Admin Route Protection

`/admin` routes in Next.js are guarded by the `AdminLayout` component which:
1. Checks `user.role === 'ADMIN'` from AuthContext
2. Redirects to `/dashboard` if not admin
3. Shows loading spinner during hydration

---

## 8. Frontend Architecture

### Next.js 15 App Router Structure

```
app/
├── layout.tsx              ← Root layout (fonts, providers, global CSS)
├── page.tsx                ← Landing page
├── providers.tsx           ← AuthProvider + TanStack QueryProvider
├── middleware.ts            ← Route protection (JWT cookie check)
│
├── login/ register/        ← Public auth pages
├── onboarding/             ← Multi-step (5 steps) onboarding
│
├── dashboard/              ← Main app (authenticated)
│   ├── layout.tsx          ← Sidebar + mobile nav
│   ├── page.tsx            ← Overview dashboard
│   ├── exercises/          ← Routines, analytics, 1RM calc, history
│   ├── meals/              ← Food log, encyclopedia, recipes, planner
│   ├── sleep/              ← Sleep log + stats
│   ├── performance/        ← Measurements, AI reports, photos
│   ├── community/          ← Challenges, forum
│   ├── coaches/            ← Messaging
│   └── plan/               ← Active plan viewer
│
├── coach/                  ← Coach Hub (COACH/TRAINER/NUTRITIONIST roles)
│   └── dashboard/          ← Client management, custom plan builder
│
├── admin/                  ← Admin panel (ADMIN role only)
│   ├── layout.tsx          ← Role guard + admin sidebar
│   └── page.tsx            ← Users, moderation reports, broadcast notifications
│
├── settings/
│   ├── profile/            ← Edit profile, BMI/BMR display
│   ├── subscription/       ← Plan comparison, Stripe checkout redirect
│   └── preferences/        ← App preferences, notifications
│
└── api/                    ← Next.js API routes (thin proxies)
    └── auth/callback/      ← OAuth callback handler
```

### State Management

| State Type | Library |
|------------|---------|
| Server/async state | TanStack Query v5 |
| Global client state | Zustand |
| Form state | React Hook Form + Zod |
| Real-time | Socket.IO client |

### Component Library

Custom components built on Tailwind CSS v3 + Framer Motion v11:
- `components/ui/` — Button, Card, Badge, Progress, Modal, etc.
- `components/nutrition/` — FastingTimer, MacroWheel, MealCard
- `components/exercise/` — ExerciseCard, RoutineBuilder, 1RMCalc
- `components/dashboard/` — StatsGrid, RecentActivity, AIInsights

---

## 9. AI Pipeline

### Three-Layer Architecture

```
User Request
     │
     ▼
┌─────────────────────────────────────────┐
│  Layer 1: Circadian Engine (Python)     │
│  • Deterministic circadian phase calc   │
│  • NumPy-based sleep model              │
│  • Output: optimal timing windows       │
└───────────────────┬─────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Layer 2: Rule Engine                   │
│  • Chrono-nutrition hard rules          │
│  • Macro ratio constraints              │
│  • Night-shift eating pattern rules     │
│  • Output: structured JSON skeleton     │
└───────────────────┬─────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│  Layer 3: Claude API                    │
│  • Model: claude-sonnet-4-6             │
│  • Constrained by skeleton (tool_use)   │
│  • Adds narrative, meal names, tips     │
│  • Output: final plan JSON              │
└─────────────────────────────────────────┘
                    │
                    ▼
            plan-service
         (persisted + served)
```

### Cost Controls
- Skeleton-constrained prompts (Claude fills pre-structured templates)
- Redis caching of generated plans (TTL: 24 hours for same inputs)
- Haiku for simple queries, Sonnet for full plan generation
- Rate limiting per user (plan generation: max 3/day on FREE tier)

---

## 10. Push Notifications

### Architecture

```
notification-service
├── In-app (Socket.IO)
│   └── Rooms: user:<userId>
│       └── Event: 'notification' payload
│
└── Push (PushService)
    ├── Web Push (VAPID via web-push npm package)
    │   └── Service Worker receives push events
    │
    └── Expo Push (React Native)
        └── POST https://exp.host/--/api/v2/push/send
```

### Web Push Flow (Browser)

```
1. Client fetches VAPID public key: GET /api/notifications/push/vapid-key
2. Client creates ServiceWorker push subscription (browser API)
3. Client registers: POST /api/notifications/push/subscribe
   Body: { endpoint, p256dh, auth }
4. Server sends: webPush.sendNotification(subscription, payload)
5. Service Worker intercepts push event → shows notification
```

### Database (push_subscriptions)

```sql
CREATE TABLE push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL,
  endpoint   TEXT NOT NULL UNIQUE,  -- browser endpoint or Expo token
  p256dh     TEXT,                  -- Web Push encryption key
  auth       TEXT,                  -- Web Push auth secret
  platform   "PushPlatform" NOT NULL DEFAULT 'WEB', -- WEB | EXPO
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Required Environment Variables

```env
VAPID_PUBLIC_KEY=   # Generate: npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=  # Generate: npx web-push generate-vapid-keys
VAPID_SUBJECT=mailto:admin@nightfuel.app
EXPO_ACCESS_TOKEN=  # Optional, from expo.dev
```

---

## 11. Payments & Subscriptions

### Tier Limits

| Feature | FREE | PRO | PREMIUM | ENTERPRISE |
|---------|------|-----|---------|------------|
| History (days) | 30 | 90 | Unlimited | Unlimited |
| Plans/month | 2 | 10 | Unlimited | Unlimited |
| AI models | Haiku | Sonnet | Sonnet | Opus |
| Analytics | ✗ | ✓ | ✓ | ✓ |
| Coach access | ✗ | ✗ | ✓ | ✓ |

### Stripe Checkout Flow

```
Client                subscription-service              Stripe
  │                          │                            │
  │  POST /subscriptions/    │                            │
  │       checkout           │                            │
  │─────────────────────────►│                            │
  │                          │  createCheckoutSession     │
  │                          │───────────────────────────►│
  │                          │  { url: checkout_url }     │
  │                          │◄───────────────────────────│
  │  { checkoutUrl }         │                            │
  │◄─────────────────────────│                            │
  │                          │                            │
  │  redirect to Stripe      │                            │
  │─────────────────────────────────────────────────────►│
  │                          │                            │
  │  (user pays)             │                            │
  │                          │  POST /webhook             │
  │                          │◄───────────────────────────│
  │                          │  checkout.session.completed│
  │                          │  → update subscription tier│
  │                          │  → publish tier-updated    │
```

### Webhook Events Handled

| Stripe Event | Action |
|-------------|--------|
| `checkout.session.completed` | Update subscription tier from metadata |
| `customer.subscription.updated` | Sync status and Stripe IDs |
| `customer.subscription.deleted` | Set status to CANCELLED |
| `invoice.payment_failed` | Log + trigger notification |

---

## 12. Database Schema Summary

### auth-service (nightfuel_auth)

```sql
users               (id, email, password_hash, role, created_at)
refresh_tokens      (id, user_id, token_hash, expires_at, revoked)
```

### notification-service (nightfuel_notifications)

```sql
notifications           (id, user_id, type, title, body, data, is_read, created_at)
notification_preferences(id, user_id, [toggle_cols], quiet_hours_start/end)
push_subscriptions      (id, user_id, endpoint UNIQUE, p256dh, auth, platform)
```

### subscription-service (nightfuel_subscriptions)

```sql
subscriptions       (id, user_id UNIQUE, tier, status, current_period_*, cancel_at_period_end, stripe_*)
subscription_events (id, user_id, event_type, from_tier, to_tier, metadata)
```

### meal-service (nightfuel_meals)

```sql
meal_logs           (id, user_id, food_id, meal_type, quantity, logged_at)
foods               (id, name, calories, protein, carbs, fat, source)
recipes             (id, user_id, name, ingredients, macros, prep_time)
grocery_lists       (id, user_id, plan_id, items)
```

### sleep-service (nightfuel_sleep)

```sql
sleep_logs          (id, user_id, start_time, end_time, quality, source[SleepSource enum])
```

---

## 13. API Reference

### Base URLs

| Environment | URL |
|-------------|-----|
| Local Docker | `http://localhost/api` |
| Production | `https://api.nightfuel.app` |

### Auth Endpoints

```
POST   /api/auth/register      { email, password, name }
POST   /api/auth/login         { email, password }
POST   /api/auth/refresh       { refreshToken }
POST   /api/auth/logout        (authenticated)
```

### Notification Endpoints

```
GET    /api/notifications                      List inbox (paginated)
PUT    /api/notifications/:id/read             Mark single read
PUT    /api/notifications/read-all             Mark all read
GET    /api/notifications/preferences          Get preferences
PUT    /api/notifications/preferences          Update preferences
GET    /api/notifications/push/vapid-key       Public VAPID key
POST   /api/notifications/push/subscribe       Register web push
POST   /api/notifications/push/subscribe/expo  Register Expo token
DELETE /api/notifications/push/unsubscribe     Remove subscription
```

### Subscription Endpoints

```
GET    /api/subscriptions/me                   Current subscription
GET    /api/subscriptions/limits               Feature limits
PUT    /api/subscriptions/upgrade              Change tier
DELETE /api/subscriptions/cancel               Cancel at period end
POST   /api/subscriptions/checkout             Create Stripe session
POST   /api/subscriptions/webhook              Stripe webhook (raw body)
```

### Plan Endpoints

```
GET    /api/plans                              List plans
POST   /api/plans                              Create plan
POST   /api/plans/generate                     AI generate plan
GET    /api/plans/:id                          Get plan
PUT    /api/plans/:id                          Update plan
DELETE /api/plans/:id                          Delete plan
```

---

## 14. Infrastructure & Deployment

### Docker Compose (Local)

```bash
# Start full stack
cd infra/docker
docker compose up -d

# Build and start (after code changes)
docker compose up -d --build

# View logs
docker compose logs -f notification-service

# Stop
docker compose down
```

### Service Port Map

| Service | Port |
|---------|------|
| Web (Next.js) | 3000 |
| auth-service | 3001 |
| shift-service | 3002 |
| circadian-engine | 3003 |
| ai-pipeline | 3004 |
| plan-service | 3005 |
| meal-service | 3006 |
| progress-service | 3007 |
| notification-service | 3008 |
| user-service | 3009 |
| sleep-service | 3010 |
| exercise-service | 3011 |
| subscription-service | 3012 |
| community-service | 3013 |
| chat-service | 3014 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| nginx | 80 |

### Railway Production Deployment

Each service is deployed as a separate Railway service in the same project:

1. Connect GitHub repo → Railway detects monorepo
2. Configure per-service `RAILWAY_DOCKERFILE_PATH` env var
3. Set all environment variables in Railway dashboard
4. PostgreSQL: Use Railway Postgres plugin (one per service) or Supabase
5. Redis: Use Railway Redis plugin or Upstash

### Health Checks

Every Fastify service exposes `GET /health`:
```json
{
  "status": "ok",
  "service": "notification-service",
  "timestamp": "2026-02-26T00:00:00.000Z",
  "db": "connected"
}
```

Python services expose `GET /health` returning `{ "status": "ok" }`.

### nginx Routing

```nginx
# Route by path prefix to upstream services
/api/auth/      → auth-service:3001
/api/shifts/    → shift-service:3002
/api/plans/     → plan-service:3005
...

# WebSocket upgrade for Socket.IO (notification-service)
/socket.io/     → notification-service:3008 (ws://)
```

---

## 15. Environment Variables

See `.env.example` at the monorepo root for a complete, annotated list.

### Minimum required for local dev

```env
# Core
JWT_SECRET=any-local-secret
DATABASE_URL=postgresql://postgres:postgrespassword@localhost:5432/nightfuel_auth

# Redis
REDIS_URL=redis://localhost:6379

# AI (optional for local — plan generation will fail without it)
ANTHROPIC_API_KEY=sk-ant-...

# Stripe (optional for local — checkout will fail without it)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Push (optional for local — push notifications disabled without it)
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

### Generating VAPID Keys

```bash
npx web-push generate-vapid-keys
# Output:
# Public Key: BExamplePublicKey...
# Private Key: ExamplePrivateKey...
```

---

## 16. Development Workflow

### Running All Services

```bash
# Install all workspace dependencies
npm install

# Start all services in parallel (Turborepo)
npm run dev

# Start a single service
cd services/notification-service && npm run dev

# Build all
npm run build

# Type check all
npm run check-types

# Lint all
npm run lint
```

### Database Operations

```bash
# Push schema changes to DB (no migration file)
cd services/notification-service
npx prisma db push

# Generate Prisma client after schema change
npx prisma generate

# Create a migration
npx prisma migrate dev --name add_push_subscriptions

# Open Prisma Studio
npx prisma studio
```

### Adding a New Service

1. Create `services/<name>-service/` with `Dockerfile`, `package.json`, `prisma/schema.prisma`, `src/index.ts`
2. Add to `turbo.json` pipeline
3. Add to `infra/docker/docker-compose.yml`
4. Add to nginx upstream config
5. Add proxy rewrite in `clients/web/next.config.js`
6. Add DB schema to `services/db/<name>_db.sql`
7. Allocate a port (next available after 3014)

### Testing

```bash
# Node services
cd services/auth-service && npm test

# Python services
cd services/circadian-engine && pytest
```

---

## Appendix: Architecture Decision Records

### ADR-001: Redis Pub/Sub over Kafka
**Decision:** Use Redis Pub/Sub for inter-service events.
**Rationale:** At current scale, Redis (already in stack for caching) is sufficient. The `EventBus` abstraction allows migration to Kafka/NATS without changing service code — only the `@nightfuel/events` package needs updating.

### ADR-002: One Database Per Service
**Decision:** Each service has its own PostgreSQL logical database.
**Rationale:** Service isolation prevents schema coupling, allows independent migrations, and enables per-service scaling. Cross-service data references use UUID strings instead of FK constraints.

### ADR-003: Skeleton-Constrained LLM Prompts
**Decision:** Claude API receives a structured JSON skeleton and fills in the values.
**Rationale:** Reduces hallucination, enforces domain constraints (chrono-nutrition rules), minimizes token usage, and enables deterministic caching.

### ADR-004: JWT over Sessions
**Decision:** Stateless JWT (15m access + 30d refresh) over server-side sessions.
**Rationale:** Stateless tokens work naturally across 12+ microservices without shared session store. Refresh token rotation provides security without sacrificing UX.
