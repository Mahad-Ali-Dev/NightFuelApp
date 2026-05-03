-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('WEB', 'EXPO');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('MEAL_REMINDER', 'WORKOUT_REMINDER', 'SLEEP_REMINDER', 'SHIFT_ALERT', 'PLAN_READY', 'ADHERENCE_ALERT', 'STREAK_UPDATE', 'WEEKLY_REPORT', 'COACH_MESSAGE', 'GOAL_ACHIEVED', 'SYSTEM');

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "meal_reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
    "workout_reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sleep_reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
    "shift_alert_enabled" BOOLEAN NOT NULL DEFAULT true,
    "plan_ready_enabled" BOOLEAN NOT NULL DEFAULT true,
    "adherence_alert_enabled" BOOLEAN NOT NULL DEFAULT true,
    "streak_update_enabled" BOOLEAN NOT NULL DEFAULT true,
    "weekly_report_enabled" BOOLEAN NOT NULL DEFAULT true,
    "coach_message_enabled" BOOLEAN NOT NULL DEFAULT true,
    "quiet_hours_start" TEXT NOT NULL DEFAULT '22:00',
    "quiet_hours_end" TEXT NOT NULL DEFAULT '07:00',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT,
    "auth" TEXT,
    "platform" "PushPlatform" NOT NULL DEFAULT 'WEB',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_key" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

