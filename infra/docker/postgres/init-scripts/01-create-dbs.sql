-- ═══════════════════════════════════════════════════════════════════════════════
-- NightFuel – Docker PostgreSQL Init: Create all service databases
-- This script runs once when the postgres container is first initialized
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Core Service Databases ──────────────────────────────────────────────────
CREATE DATABASE nightfuel_auth;
CREATE DATABASE nightfuel_users;
CREATE DATABASE nightfuel_shifts;
CREATE DATABASE nightfuel_plans;
CREATE DATABASE nightfuel_meals;
CREATE DATABASE nightfuel_exercise;
CREATE DATABASE nightfuel_sleep;
CREATE DATABASE nightfuel_progress;
CREATE DATABASE nightfuel_notifications;
CREATE DATABASE nightfuel_subscriptions;
CREATE DATABASE nightfuel_state;
CREATE DATABASE nightfuel_community;
CREATE DATABASE nightfuel_chat;

-- ─── Future / Reserved ───────────────────────────────────────────────────────
-- CREATE DATABASE nightfuel_analytics;
-- CREATE DATABASE nightfuel_enterprise;
