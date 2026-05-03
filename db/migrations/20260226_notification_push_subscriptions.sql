-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Add push_subscriptions table to notification_db
-- Date: 2026-02-26
-- Service: notification-service
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE "PushPlatform" AS ENUM ('WEB', 'EXPO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID            NOT NULL,
  endpoint    TEXT            NOT NULL,
  p256dh      TEXT,
  auth        TEXT,
  platform    "PushPlatform"  NOT NULL DEFAULT 'WEB',
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON push_subscriptions(user_id);

CREATE OR REPLACE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
