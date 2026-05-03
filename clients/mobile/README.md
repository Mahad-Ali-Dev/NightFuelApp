# 🌙 NightFuel Mobile

> **React Native Mobile App — Chrono-Nutrition & Fitness for Shift Workers**
> Built with Expo SDK 52 · React Native 0.76 · TypeScript 5.5+

[![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android-blue)](#platforms)
[![Expo SDK](https://img.shields.io/badge/Expo%20SDK-52-000020)](#tech-stack)
[![React Native](https://img.shields.io/badge/React%20Native-0.76-61DAFB)](#tech-stack)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6)](#tech-stack)
[![Screens](https://img.shields.io/badge/Screens-49-FF6B35)](#screen-inventory)
[![Backend](https://img.shields.io/badge/Microservices-16-00D4AA)](#backend-integration)

---

## Table of Contents

- [Overview](#overview)
- [Design System](#design-system)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Screen Inventory](#screen-inventory)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Backend Integration](#backend-integration)
- [Navigation Architecture](#navigation-architecture)
- [State Management](#state-management)
- [Key Features](#key-features)
- [Build & Deployment](#build--deployment)
- [Testing Strategy](#testing-strategy)
- [Performance Optimizations](#performance-optimizations)
- [Contributing](#contributing)

---

## Overview

NightFuel Mobile is the native companion to the NightFuel platform — a **chrono-nutrition and fitness app** purpose-built for night-shift workers, rotating-schedule professionals, and anyone outside the 9-to-5 paradigm.

The app connects to the existing NightFuel microservices backend (16 services) and delivers all platform functionality through a premium, dark-themed mobile experience with circadian-aware features.

### Why Mobile?

| Aspect | Value |
|--------|-------|
| 🔔 Real-time push | Meal reminders, caffeine cutoffs, sleep window alerts — timed to _your_ shift |
| 📱 Offline-first | Food library (760 foods), workout logging, and plan caching work without internet |
| ⌚ Wearable sync | Apple Watch, Oura Ring, Fitbit, Garmin for automatic sleep & activity data |
| 🏋️ Gym-ready | Active workout logger with rest timer, set tracking, and 1RM calculations |
| 🕌 Ramadan Mode | Suhoor/Iftar time-aware fasting with hydration strategy |

---

## Design System

The mobile app follows a **premium dark-mode-first** design language, derived from 49 Stitch-generated UI screens.

### Color Palette

```
┌─────────────────────────────────────────────────────────┐
│  CORE PALETTE                                           │
├─────────────────────────────────────────────────────────┤
│  Background Primary    #0D1117   Deep Navy Black        │
│  Background Secondary  #161B22   Card Surface           │
│  Background Tertiary   #1C2333   Elevated Surface       │
│  Border / Divider      #2D3748   Subtle Borders         │
├─────────────────────────────────────────────────────────┤
│  ACCENT COLORS                                          │
├─────────────────────────────────────────────────────────┤
│  Coral / CTA           #FF6B35   Primary Actions        │
│  Cyan / Highlight      #00D4AA   Progress & Success     │
│  Electric Blue         #4FC3F7   Informational          │
│  Purple / Coach        #7C4DFF   AI & Coach Features    │
│  Red / Alert           #FF4444   Warnings & Danger      │
│  Amber / Warning       #FFB300   Caution States         │
├─────────────────────────────────────────────────────────┤
│  TEXT                                                   │
├─────────────────────────────────────────────────────────┤
│  Text Primary          #FFFFFF   Headings & Bold        │
│  Text Secondary        #8B949E   Body Copy              │
│  Text Tertiary         #484F58   Placeholders           │
│  Accent Text           #FF6B35   Highlighted Labels     │
└─────────────────────────────────────────────────────────┘
```

### Typography

| Role | Font | Weight | Size |
|------|------|--------|------|
| Display | Inter | 800 (ExtraBold) | 32–40px |
| Heading | Inter | 700 (Bold) | 22–28px |
| Subhead | Inter | 600 (SemiBold) | 16–18px |
| Body | Inter | 400 (Regular) | 14–16px |
| Caption | Inter | 400 (Regular) | 12px |
| Mono/Stats | JetBrains Mono | 600 | 24–48px |

### Component Patterns

| Pattern | Usage |
|---------|-------|
| **Glassmorphic Cards** | Semi-transparent cards with subtle borders and blur |
| **Gradient CTAs** | Coral-to-red gradient buttons for primary actions |
| **Circular Progress** | Macro rings, hydration gauges, sleep scores |
| **Timeline View** | 24h schedule with color-coded events |
| **Chat Bubbles** | AI Coach Ria with rich media cards |
| **Data Cards** | Stats with icon + label + value + trend indicator |
| **Bottom Sheet** | Modal-style content panels (meal log, filters) |
| **FAB (AI Bot)** | Floating purple AI assistant button (persistent) |

### Light Mode Support

The app includes both dark and light variants for the dashboard and nutrition screens. Light mode uses:
- Background: `#F0F2F5`
- Cards: `#FFFFFF`
- Accents remain the same coral/cyan palette

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | React Native 0.76 + Expo SDK 52 | Cross-platform native runtime |
| **Language** | TypeScript 5.5+ (strict mode) | Type-safe development |
| **Navigation** | Expo Router (file-based) | Tab + Stack navigation |
| **State (Server)** | TanStack Query v5 | API caching, background sync |
| **State (Client)** | Zustand 5 | Auth tokens, theme, local state |
| **Storage** | expo-secure-store | JWT/auth token persistence |
| **Offline DB** | expo-sqlite | Food library, cached plans |
| **HTTP Client** | Axios | API layer (mirrors web client) |
| **WebSocket** | Socket.IO client | Real-time coach chat |
| **Charts** | react-native-gifted-charts | Analytics, circadian curves |
| **Animations** | react-native-reanimated 3 | Micro-interactions, transitions |
| **Gestures** | react-native-gesture-handler | Swipe actions, bottom sheets |
| **Icons** | @expo/vector-icons | Ionicons + MaterialCommunityIcons |
| **Notifications** | expo-notifications | Push notifications via FCM/APNS |
| **Camera/Barcode** | expo-camera | Food barcode scanning |
| **Health** | react-native-health / expo-health | Apple HealthKit / Google Fit |
| **Shared Types** | @nightfuel/types | Enums, interfaces from monorepo |
| **Testing** | Jest + React Native Testing Library | Unit & component tests |
| **E2E Testing** | Maestro | End-to-end mobile flows |

---

## Architecture

```
clients/mobile/
├── app/                          # Expo Router file-based routes
│   ├── _layout.tsx               # Root layout (providers, theme)
│   ├── index.tsx                 # Splash / auth check redirect
│   ├── (auth)/                   # Auth group (no tab bar)
│   │   ├── login.tsx
│   │   ├── register.tsx
│   │   └── forgot-password.tsx
│   ├── (onboarding)/             # 8-step onboarding flow
│   │   ├── _layout.tsx           # Progress bar wrapper
│   │   ├── shift-type.tsx        # Step 1: Night/Rotating/On-Call
│   │   ├── sleep-schedule.tsx    # Step 2: Sleep window config
│   │   ├── metrics-goals.tsx     # Step 3: Body metrics & goals
│   │   ├── dietary-needs.tsx     # Step 4: Diet preferences
│   │   ├── environment.tsx       # Step 5: Work environment
│   │   ├── ai-optimization.tsx   # Step 6: AI settings
│   │   ├── profile-summary.tsx   # Step 7: Archetype reveal
│   │   └── permissions.tsx       # Step 8: Health + notifications
│   ├── (tabs)/                   # Main app (with tab bar)
│   │   ├── _layout.tsx           # Tab bar configuration
│   │   ├── index.tsx             # Home / Dashboard
│   │   ├── schedule.tsx          # 24h Schedule & Calendar
│   │   ├── nutrition.tsx         # Nutrition Hub
│   │   ├── training.tsx          # Workout Library
│   │   └── profile.tsx           # Profile & Settings
│   ├── (modals)/                 # Full-screen modals
│   │   ├── ai-coach.tsx          # Ria AI Chat
│   │   ├── active-workout.tsx    # Active Session Logger
│   │   ├── meal-detail.tsx       # Recipe & Meal Detail
│   │   ├── build-plate.tsx       # Interactive Plate Builder
│   │   └── premium.tsx           # Subscription Plans
│   └── (coach)/                  # Coach-only screens
│       ├── _layout.tsx           # Coach tab bar
│       ├── hub.tsx               # Coach Command Center
│       ├── clients.tsx           # Client List & Monitoring
│       ├── client/[id].tsx       # Client Deep Dive
│       ├── roster.tsx            # Plan Builder
│       └── chat/[id].tsx         # Coach-Client Chat
│
├── src/
│   ├── api/                      # API layer
│   │   ├── client.ts             # Axios instance + interceptors
│   │   ├── auth.ts               # Auth endpoints
│   │   ├── shifts.ts             # Shift service API
│   │   ├── plans.ts              # Plan service API
│   │   ├── meals.ts              # Meal service API
│   │   ├── exercises.ts          # Exercise service API
│   │   ├── progress.ts           # Progress service API
│   │   ├── sleep.ts              # Sleep service API
│   │   ├── community.ts          # Community service API
│   │   ├── chat.ts               # Chat service API + WebSocket
│   │   ├── subscriptions.ts      # Subscription service API
│   │   ├── notifications.ts      # Notification service API
│   │   ├── circadian.ts          # Circadian engine API
│   │   └── ai.ts                 # AI pipeline API
│   │
│   ├── hooks/                    # Custom React hooks
│   │   ├── useAuth.ts            # Auth state & actions
│   │   ├── useShift.ts           # Current shift info
│   │   ├── useCircadian.ts       # Circadian clock data
│   │   ├── usePlan.ts            # Daily plan & timeline
│   │   ├── useNutrition.ts       # Meal logs, macros, fasting
│   │   ├── useWorkout.ts         # Active session, exercise data
│   │   ├── useProgress.ts        # Stats, streaks, history
│   │   ├── useSleep.ts           # Sleep logs & scoring
│   │   ├── useHydration.ts       # Water + caffeine tracking
│   │   ├── useChat.ts            # WebSocket chat connection
│   │   ├── useCommunity.ts       # Feed, challenges, social
│   │   └── useTheme.ts           # Dark/light mode toggle
│   │
│   ├── store/                    # Zustand stores
│   │   ├── authStore.ts          # JWT, user session, role
│   │   ├── shiftStore.ts         # Active shift, rotation
│   │   ├── themeStore.ts         # Dark/light preference
│   │   ├── onboardingStore.ts    # Onboarding progress state
│   │   └── offlineStore.ts       # Offline queue & sync
│   │
│   ├── components/               # Reusable UI components
│   │   ├── ui/                   # Design system primitives
│   │   │   ├── Card.tsx          # Glassmorphic card
│   │   │   ├── Button.tsx        # Gradient CTA button
│   │   │   ├── CircularProgress.tsx  # Ring gauge
│   │   │   ├── ProgressBar.tsx   # Linear progress
│   │   │   ├── Badge.tsx         # Status badges
│   │   │   ├── Avatar.tsx        # User/coach avatars
│   │   │   ├── BottomSheet.tsx   # Modal bottom sheet
│   │   │   ├── FAB.tsx           # Floating action button
│   │   │   ├── Input.tsx         # Text input
│   │   │   ├── SearchBar.tsx     # Search with filters
│   │   │   └── TabBar.tsx        # Custom tab bar
│   │   ├── dashboard/            # Dashboard-specific
│   │   │   ├── ShiftCountdown.tsx
│   │   │   ├── NextMealCard.tsx
│   │   │   ├── CircadianClock.tsx
│   │   │   ├── QuickActions.tsx
│   │   │   ├── HydrationWidget.tsx
│   │   │   ├── SleepWindowCard.tsx
│   │   │   └── ScheduleTimeline.tsx
│   │   ├── nutrition/            # Nutrition-specific
│   │   │   ├── MacroRings.tsx
│   │   │   ├── FastingTimer.tsx
│   │   │   ├── MealLogCard.tsx
│   │   │   ├── FoodSearchSheet.tsx
│   │   │   └── PlateBuilder.tsx
│   │   ├── workout/              # Workout-specific
│   │   │   ├── WorkoutCard.tsx
│   │   │   ├── ExerciseRow.tsx
│   │   │   ├── SetLogger.tsx
│   │   │   ├── RestTimer.tsx
│   │   │   └── StrengthChart.tsx
│   │   ├── coach/                # Coach features
│   │   │   ├── ClientCard.tsx
│   │   │   ├── AlertBanner.tsx
│   │   │   └── PlanBuilder.tsx
│   │   └── chat/                 # Chat components
│   │       ├── ChatBubble.tsx
│   │       ├── RichMediaCard.tsx
│   │       ├── QuickReplies.tsx
│   │       └── VoiceInput.tsx
│   │
│   ├── theme/                    # Design tokens
│   │   ├── colors.ts             # Full color palette
│   │   ├── typography.ts         # Font scales & families
│   │   ├── spacing.ts            # Spacing scale (4px grid)
│   │   ├── shadows.ts            # Elevation shadows
│   │   └── index.ts              # Theme provider & context
│   │
│   ├── utils/                    # Utilities
│   │   ├── circadian.ts          # Circadian time helpers
│   │   ├── formatters.ts         # Date, number, macro formatting
│   │   ├── validators.ts         # Form validation schemas
│   │   ├── storage.ts            # SecureStore helpers
│   │   └── offline.ts            # Offline queue & retry
│   │
│   └── types/                    # Local type extensions
│       ├── navigation.ts         # Route params typing
│       └── api.ts                # API response types
│
├── assets/                       # Static assets
│   ├── fonts/                    # Inter, JetBrains Mono
│   ├── images/                   # Splash, icons, illustrations
│   └── animations/               # Lottie files
│
├── app.json                      # Expo config
├── babel.config.js               # Babel + Reanimated plugin
├── metro.config.js               # Metro bundler (monorepo)
├── tsconfig.json                 # TypeScript config
├── eas.json                      # EAS Build profiles
└── package.json                  # Dependencies
```

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    NightFuel Mobile App                      │
├─────────────┬──────────────┬──────────────┬────────────────┤
│  Expo Router│  Reanimated  │ Gesture Hndlr│  Notifications │
│  (Screens)  │  (Animate)   │  (Touch)     │  (Push/Local)  │
├─────────────┴──────────────┴──────────────┴────────────────┤
│                    React Components                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐ │
│  │Dashboard │  │Nutrition │  │ Workouts │  │  AI Coach   │ │
│  │  Screen  │  │   Hub    │  │ Library  │  │  Ria Chat   │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘ │
├───────┴──────────────┴──────────────┴──────────────┴───────┤
│                    Custom Hooks Layer                        │
│  useShift · useCircadian · useNutrition · useWorkout · ...  │
├─────────────────────────────────────────────────────────────┤
│          TanStack Query          │        Zustand           │
│     (Server State + Cache)       │    (Client State)        │
├──────────────────────────────────┴─────────────────────────┤
│                     API Layer (Axios)                       │
│  auth·shifts·plans·meals·exercises·progress·sleep·chat·ai  │
├─────────────────────────────────────────────────────────────┤
│  expo-secure-store │ expo-sqlite │ Socket.IO │ expo-camera  │
├─────────────────────────────────────────────────────────────┤
│              NightFuel Backend (16 Microservices)            │
│  :3001 auth │ :3002 shift │ :3003 circadian │ :3004 ai     │
│  :3005 plan │ :3006 meal  │ :3007 progress  │ :3008 notif  │
│  :3009 user │ :3010 sleep │ :3011 exercise  │ :3012 subs   │
│  :3013 community │ :3014 chat                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Screen Inventory

All 49 screens are designed and ready for implementation. Organized by feature domain:

### 🏠 Dashboard (3 screens)

| Screen | File | Description |
|--------|------|-------------|
| Dashboard Dark | `nightfuel_dashboard_new_dark_ui` | Primary home — shift countdown, next meal, circadian clock, quick actions, hydration bar, 24h timeline |
| Dashboard Light | `nightfuel_dashboard_new_light_ui` | Light variant of the dashboard |
| Command Center | `nightfuel_command_center` | Circadian bell curve, upcoming action card, quick action grid |

### 🛡️ Onboarding (8 screens)

| Screen | File | Description |
|--------|------|-------------|
| Shift Selection | `onboarding_shift_selection` | Night/Rotating/On-Call shift type picker |
| Sleep Schedule | `onboarding_sleep_schedule` | Sleep window configuration with time pickers |
| Metrics Goals | `onboarding_metrics_goals` | Body stats (weight, height, age) + fitness goals |
| Metrics Dark | `onboarding_metrics_dark` | Alternate dark style for metrics entry |
| Dietary Needs | `onboarding_dietary_needs` | Diet preference selection (Halal, Vegan, Keto, etc.) |
| Environment | `onboarding_environment_setup` | Work environment & lifestyle configuration |
| Profile Summary | `profile_summary_archetype` | Circadian archetype reveal ("Night Shift Optimizer") |
| Permissions | `final_step_permissions_syncing` | Health, notifications, device sync permissions |

### 🍽️ Nutrition (6 screens)

| Screen | File | Description |
|--------|------|-------------|
| Nutrition Hub | `nutrition_hub_fasting_tracker` | Daily kcal, macro rings, fasting timer, build plate CTA |
| Plate Builder Dark | `nutrition_plate_builder_dark` | Interactive meal builder (dark) |
| Plate Builder Light | `nutrition_plate_builder_light` | Interactive meal builder (light) |
| Interactive Plate | `interactive_plate_builder` | Drag-and-drop food plate composition |
| Meal Detail | `meal_detail_recipe_page` | Full recipe page with ingredients & instructions |
| Nutrition Heatmap | `nutrition_consistency_heatmap` | GitHub-style nutrition consistency visualization |

### 🏋️ Workouts (5 screens)

| Screen | File | Description |
|--------|------|-------------|
| Workout Library | `workout_library_grid` | Searchable grid with filter chips (muscle group, equipment, intensity) |
| Active Session | `active_workout_logger` | Live workout — rest timer ring, set/rep/weight logger |
| Workout Summary | `workout_summary_recovery` | Post-workout summary with recovery recommendations |
| Custom Creator | `custom_workout_creator` | Build your own workout routine |
| Exercise Detail | `exercise_detail_ai_tips` | Exercise info with AI-powered form tips |
| Rest Day | `rest_day_mobility_plan` | Active recovery & mobility plan |

### 💤 Sleep & Circadian (4 screens)

| Screen | File | Description |
|--------|------|-------------|
| AI Generating Model | `ai_generating_circadian_model` | Loading screen for circadian model generation |
| Daily Plan Timeline | `ai_daily_plan_timeline` | Full 24h AI-generated daily plan |
| Circadian Drift | `circadian_drift_analytics` | Drift analytics & entrainment tracking |
| Chronobiology Plan | `chronobiology_plan_redesign` | Detailed chrono-plan with meal/sleep/activity blocks |

### 📊 Analytics (3 screens)

| Screen | File | Description |
|--------|------|-------------|
| Sleep vs. Performance | `sleep_vs._performance_analytics` | Bar+line chart, fatigue point, deep sleep, correlation |
| Strength Trends | `strength_analytics_1rm_trends` | 1RM tracking per exercise over time |
| AI Weekly Recap | `ai_weekly_recap_report` | AI-generated weekly performance summary |

### 🤖 AI Coach (1 screen)

| Screen | File | Description |
|--------|------|-------------|
| AI Coach Ria | `ai_coach_ria_chat` | Conversational AI with quick reply chips, meal suggestion cards, typing indicator |

### 💧 Health Tracking (2 screens)

| Screen | File | Description |
|--------|------|-------------|
| Hydration & Caffeine | `hydration_caffeine_tracker` | Dual gauge (water/caffeine), quick add, alertness forecast |
| Macro-Sleep Warning | `macro_sleep_conflict_warning` | Conflict detection between macros and sleep quality |

### 🕌 Ramadan Mode (1 screen)

| Screen | File | Description |
|--------|------|-------------|
| Ramadan Config | `ramadan_mode_configuration` | Suhoor/Iftar time config, hydration strategy, AI plan recalculation |

### 👥 Community (2 screens)

| Screen | File | Description |
|--------|------|-------------|
| Community Feed | `community_peer_support_feed` | Social feed with trending topics, posts, images, reactions |
| Challenges | `group_challenges_leaderboards` | Group challenges with leaderboard rankings |

### 🏅 Coach Portal (5 screens)

| Screen | File | Description |
|--------|------|-------------|
| Coach Hub | `coach_hub_dashboard` | Admin dashboard — active clients, adherence, critical alerts |
| Client List | `client_list_adherence_monitoring` | Filterable client roster with adherence metrics |
| Client Deep Dive | `client_performance_deep_dive` | Individual client analytics & history |
| Coaching Requests | `coaching_request_management` | Incoming coaching request queue |
| Coach Chat | `real_time_client_coaching_chat` | Real-time coach-client messaging |
| Plan Builder | `professional_plan_builder_ui` | Coach plan creation tool |
| Member Profile | `member_profile_detail_view` | Client profile overview |

### ⚙️ Settings & Other (5 screens)

| Screen | File | Description |
|--------|------|-------------|
| AI Optimization | `ai_optimization_settings` | Fine-tune AI model preferences |
| Account Security | `account_security_settings` | Password, 2FA, session management |
| Device Integrations | `device_health_integrations` | Connect Apple Watch, Oura, Fitbit, Garmin |
| Premium Plans | `premium_subscription_plans` | Subscription tiers (Basic → Pro → Elite) |
| Help & Offline | `help_offline_system_state` | Support center + offline system status |
| Shift Rotation | `shift_rotation_adjustment` | Adjust shift rotation schedule |

---

## Getting Started

### Prerequisites

- **Node.js** 22 LTS (`>=22.0.0`)
- **npm** 10+ (comes with Node.js)
- **Expo CLI** (installed via `npx`)
- **iOS Simulator** (macOS only) or **Android Emulator** (Studio)
- **Expo Go** app on physical device (for initial development)

### 1. Install Dependencies

```bash
# From the monorepo root
cd clients/mobile
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
```

```env
# Backend API (use local services or Railway)
API_BASE_URL=http://localhost:3001  # For emulator: use 10.0.2.2 (Android) or localhost (iOS)

# OR: Railway production
# API_BASE_URL=https://nightfuel-api.up.railway.app

# Feature Flags
ENABLE_OFFLINE_MODE=true
ENABLE_BARCODE_SCANNER=true
ENABLE_HEALTH_SYNC=true
```

### 3. Start Development

```bash
# Start Expo dev server
npx expo start

# Platform-specific
npx expo start --ios        # iOS Simulator
npx expo start --android    # Android Emulator
npx expo start --web        # Web (limited)
```

### 4. Monorepo Metro Config

Since this lives inside a Turborepo monorepo, the Metro bundler needs extra config to resolve `@nightfuel/*` packages:

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
```

---

## Backend Integration

The mobile app connects directly to the 16 NightFuel microservices. Unlike the web client (which uses Next.js `rewrites()` as a proxy), the mobile app talks to services **directly** via their base URLs.

### Service Map

| Service | Port | Mobile API Module | Key Endpoints |
|---------|------|-------------------|---------------|
| **auth-service** | 3001 | `api/auth.ts` | `POST /v1/auth/login`, `POST /v1/auth/register`, `POST /v1/auth/refresh` |
| **shift-service** | 3002 | `api/shifts.ts` | `GET /v1/shifts/current`, `POST /v1/shifts`, `PUT /v1/shifts/:id` |
| **circadian-engine** | 3003 | `api/circadian.ts` | `POST /v1/circadian/compute`, `GET /v1/circadian/model` |
| **ai-pipeline** | 3004 | `api/ai.ts` | `POST /v1/ai/chat`, `POST /v1/ai/swap-meal`, `POST /v1/ai/score` |
| **plan-service** | 3005 | `api/plans.ts` | `POST /v1/plans/generate`, `GET /v1/plans/today` |
| **meal-service** | 3006 | `api/meals.ts` | `GET /v1/meals/search`, `POST /v1/meals/log`, `GET /v1/meals/fasting` |
| **progress-service** | 3007 | `api/progress.ts` | `GET /v1/progress/today`, `POST /v1/progress/hydration`, `GET /v1/progress/streak` |
| **notification-service** | 3008 | `api/notifications.ts` | `GET /v1/notifications`, `PUT /v1/notifications/read` |
| **user-service** | 3009 | `api/users.ts` | `GET /v1/users/profile`, `PUT /v1/users/onboarding` |
| **sleep-service** | 3010 | `api/sleep.ts` | `POST /v1/sleep/log`, `GET /v1/sleep/quality`, `GET /v1/sleep/analytics` |
| **exercise-service** | 3011 | `api/exercises.ts` | `GET /v1/exercises/library`, `POST /v1/exercises/sessions`, `GET /v1/exercises/1rm` |
| **subscription-service** | 3012 | `api/subscriptions.ts` | `GET /v1/subscriptions/status`, `POST /v1/subscriptions/upgrade` |
| **community-service** | 3013 | `api/community.ts` | `GET /v1/community/feed`, `POST /v1/community/posts`, `GET /v1/community/challenges` |
| **chat-service** | 3014 | `api/chat.ts` | `WS /v1/chat/connect`, `GET /v1/chat/history`, `POST /v1/chat/send` |

### API Client Pattern

```typescript
// src/api/client.ts
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '@env';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// JWT interceptor — attach token from SecureStore
apiClient.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('nf_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Token refresh interceptor
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = await SecureStore.getItemAsync('nf_refresh_token');
      // ... refresh logic, retry original request
    }
    return Promise.reject(error);
  }
);

export default apiClient;
```

### Authentication Flow

```
 Mobile App                    auth-service (:3001)
     │                              │
     ├── POST /v1/auth/login ──────►│
     │   { email, password }        │
     │                              │
     │◄── { accessToken,           │
     │      refreshToken,           │
     │      user }                  │
     │                              │
     ├── Store in SecureStore        │
     │   nf_access_token            │
     │   nf_refresh_token           │
     │                              │
     ├── All subsequent requests ──►│ Authorization: Bearer <token>
     │   with Bearer token          │
     │                              │
     ├── On 401, refresh ─────────►│ POST /v1/auth/refresh
     │   { refreshToken }           │
     │◄── { newAccessToken }        │
```

---

## Navigation Architecture

```
Root
├── (auth)                    # No tab bar
│   ├── login
│   ├── register
│   └── forgot-password
│
├── (onboarding)              # Progress bar header, no tabs
│   ├── shift-type           # Step 1
│   ├── sleep-schedule       # Step 2
│   ├── metrics-goals        # Step 3
│   ├── dietary-needs        # Step 4
│   ├── environment          # Step 5
│   ├── ai-optimization      # Step 6
│   ├── profile-summary      # Step 7
│   └── permissions          # Step 8
│
├── (tabs)                    # Main app — bottom tab bar
│   ├── 🏠 Home              → Dashboard
│   ├── 📅 Schedule          → 24h Timeline
│   ├── 🍽 Nutrition          → Nutrition Hub
│   ├── 🏋️ Training          → Workout Library
│   └── 👤 Profile           → Settings & Profile
│
├── (modals)                  # Presented modally over tabs
│   ├── ai-coach             # Full-screen Ria chat
│   ├── active-workout       # Workout in progress
│   ├── meal-detail          # Recipe viewer
│   ├── build-plate          # Plate builder
│   └── premium              # Subscription paywall
│
└── (coach)                   # Coach role — separate tab set
    ├── 🎯 Hub               → Command Center
    ├── 👥 Clients           → Client List
    ├── 📋 Roster            → Plan Builder
    └── ⚙️ Settings          → Coach Settings
```

### Tab Bar Design

The tab bar follows the Stitch UI designs:
- **Background**: `#0D1117` with top border `#2D3748`
- **Active icon**: Coral fill (`#FF6B35`)
- **Inactive icon**: Muted grey (`#484F58`)
- **Center FAB**: Orange `+` button (quick actions) or Purple AI bot

---

## State Management

### Server State (TanStack Query)

```typescript
// Example: Dashboard data
const { data: plan } = useQuery({
  queryKey: ['plan', 'today'],
  queryFn: () => planApi.getToday(),
  staleTime: 5 * 60 * 1000,  // 5 min
});

const { data: progress } = useQuery({
  queryKey: ['progress', 'today'],
  queryFn: () => progressApi.getToday(),
  refetchInterval: 60 * 1000,  // Auto-refresh every 60s
});
```

### Client State (Zustand)

```typescript
// Auth store
interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  role: Role;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}
```

### Offline-First Strategy

| Data | Strategy | Storage |
|------|----------|---------|
| Food library (760 items) | Pre-loaded SQLite | `expo-sqlite` |
| Today's plan | Cache with 5min stale time | TanStack Query cache |
| Workout sessions | Optimistic mutations, queue | Zustand + MMKV |
| Meal logs | Offline queue, sync on reconnect | MMKV + retry queue |
| Auth tokens | Encrypted storage | `expo-secure-store` |

---

## Key Features

### 1. Circadian Dashboard
- Real-time shift countdown with animated timer
- Circadian bell curve visualization (SVG/Canvas)
- AI-generated cortisol/melatonin insights
- Color-coded 24h timeline with swipe navigation

### 2. Nutrition Hub
- 2,450 kcal daily goal with animated progress ring
- Macro breakdown (Protein/Carbs/Fat) circular gauges
- 16:8 fasting timer with live countdown
- Interactive plate builder with drag-and-drop
- Dual food search: Online (3M+ foods) + Library (760 offline)

### 3. Active Workout Logger
- Circular rest timer with haptic feedback
- Progressive set logging (weight/reps) with swipe-to-complete
- AI form tips per exercise
- Post-workout recovery score & summary

### 4. AI Coach Ria
- Conversational chat with rich media cards
- Quick reply chips ("I feel tired", "What to eat now?")
- Contextual meal suggestions with embedded recipe cards
- Voice input support via `expo-speech`

### 5. Coach Portal
- Real-time client telemetry dashboard
- Critical alert system (sleep, fatigue, adherence)
- Plan builder with drag-and-drop scheduling
- In-app coach-client messaging (WebSocket)

### 6. Ramadan Mode
- Suhoor/Iftar time-aware schedule adjustments
- Hydration strategy calculator for non-fasting windows
- AI plan recalculation for Ramadan

---

## Build & Deployment

### Development Builds

```bash
# Create a development build (required for native modules)
npx expo prebuild
npx expo run:ios
npx expo run:android
```

### EAS Build (Production)

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure profiles
eas build:configure

# Build for stores
eas build --platform ios --profile production
eas build --platform android --profile production

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

### EAS Build Profiles (`eas.json`)

```json
{
  "cli": { "version": ">= 13.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "autoIncrement": true,
      "ios": { "bundleIdentifier": "com.nightfuel.app" },
      "android": { "package": "com.nightfuel.app" }
    }
  },
  "submit": {
    "production": {
      "ios": { "appleId": "...", "ascAppId": "..." },
      "android": { "serviceAccountKeyPath": "./google-services.json" }
    }
  }
}
```

---

## Testing Strategy

### Unit Tests (Jest)

```bash
npm test                    # Run all tests
npm run test:coverage       # Coverage report
```

### Component Tests (RNTL)

```bash
# Test individual components
npx jest --testPathPattern=components
```

### E2E Tests (Maestro)

```yaml
# maestro/flows/login.yaml
appId: com.nightfuel.app
---
- launchApp
- tapOn: "Email"
- inputText: "test@nightfuel.com"
- tapOn: "Password"
- inputText: "password123"
- tapOn: "Sign In"
- assertVisible: "Your shift ends"
```

```bash
# Run E2E flows
maestro test maestro/flows/
```

---

## Performance Optimizations

| Optimization | Implementation |
|-------------|----------------|
| **List virtualization** | `FlashList` for feed, workout library, food search |
| **Image caching** | `expo-image` with disk cache for profile pics, food images |
| **Bundle splitting** | Lazy-load coach portal, analytics screens |
| **Skeleton screens** | Shimmer placeholder during API calls |
| **Memo patterns** | `React.memo` + `useMemo` for expensive chart renders |
| **Hermes engine** | Enabled by default in Expo SDK 52 |
| **Reanimated worklets** | UI thread animations for rest timer, progress rings |
| **Offline SQLite** | Pre-seeded food DB avoids network calls |

---

## Contributing

### Branch Naming
```
feature/NF-XX-screen-name     # New screens
fix/NF-XX-bug-description     # Bug fixes
refactor/NF-XX-description    # Refactoring
```

### Commit Convention
```
feat(nutrition): add fasting timer component
fix(dashboard): correct circadian clock timezone offset
style(workout): update rest timer ring colors
chore(deps): bump expo-router to 4.1.0
```

### Screen Development Workflow

1. **Reference Stitch design** in `stitch_nightfuel_home_feed/<screen_name>/screen.png`
2. **Create route** in `app/(tabs|modals|coach)/screen.tsx`
3. **Build components** using design system tokens from `src/theme/`
4. **Wire API hook** from `src/hooks/` → `src/api/`
5. **Add TanStack Query** cache configuration
6. **Write tests** for component + hook
7. **Pixel-match** with Stitch design screenshot

---

## Platforms

| Platform | Min Version | Status |
|----------|------------|--------|
| iOS | 16.0+ | ✅ Primary |
| Android | API 28+ (Android 9) | ✅ Primary |
| Web | Modern browsers | ⚠️ Limited (via Expo Web) |

---

## License

MIT © NightFuel

---

<p align="center">
  <strong>🌙 Built for the ones who work while the world sleeps.</strong>
</p>
