-- ==========================================
-- Service: progress-service
-- ==========================================

-- CreateTable
CREATE TABLE IF NOT EXISTS "daily_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "calories_target" DOUBLE PRECISION,
    "calories_actual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "protein_target" DOUBLE PRECISION,
    "protein_actual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbs_target" DOUBLE PRECISION,
    "carbs_actual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fat_target" DOUBLE PRECISION,
    "fat_actual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "meals_logged" INTEGER NOT NULL DEFAULT 0,
    "is_adherent" BOOLEAN NOT NULL DEFAULT false,
    "fatigue_score" INTEGER NOT NULL DEFAULT 0,
    "hydration_actual" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "step_count" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "supplements_logged" JSONB,
    "light_exposure_completed" BOOLEAN NOT NULL DEFAULT false,
    "plan_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "streaks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_adherent_date" DATE,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "streaks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "body_metrics" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "weight_kg" DOUBLE PRECISION,
    "height_cm" DOUBLE PRECISION,
    "body_fat_pct" DOUBLE PRECISION,
    "muscle_mass_kg" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "chest_cm" DOUBLE PRECISION,
    "waist_cm" DOUBLE PRECISION,
    "hips_cm" DOUBLE PRECISION,
    "arms_cm" DOUBLE PRECISION,
    "thighs_cm" DOUBLE PRECISION,
    "calves_cm" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "body_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "hydration_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount_ml" INTEGER NOT NULL,
    "daily_goal_ml" INTEGER NOT NULL DEFAULT 3000,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hydration_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "performance_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "week_range" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "highlights" JSONB NOT NULL,
    "improvements" JSONB NOT NULL,
    "focus_area" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "daily_progress_user_id_date_idx" ON "daily_progress"("user_id", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "daily_progress_user_id_date_key" ON "daily_progress"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "streaks_user_id_key" ON "streaks"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "body_metrics_user_id_recorded_at_idx" ON "body_metrics"("user_id", "recorded_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_usage_logs_user_id_created_at_idx" ON "ai_usage_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "hydration_logs_user_id_date_idx" ON "hydration_logs"("user_id", "date" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "performance_reports_user_id_date_idx" ON "performance_reports"("user_id", "date" DESC);
