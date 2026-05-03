-- ==========================================
-- Service: user-service
-- ==========================================

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "date_of_birth" DATE,
    "height_cm" DOUBLE PRECISION,
    "weight_kg" DOUBLE PRECISION,
    "biological_sex" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "region" TEXT NOT NULL DEFAULT 'us',
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_step" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "primary_goal" TEXT NOT NULL DEFAULT 'GENERAL_HEALTH',
    "dietary_preference" TEXT NOT NULL DEFAULT 'NONE',
    "target_calories" DOUBLE PRECISION,
    "target_protein_g" DOUBLE PRECISION,
    "target_carbs_g" DOUBLE PRECISION,
    "target_fat_g" DOUBLE PRECISION,
    "activity_level" TEXT NOT NULL DEFAULT 'MODERATELY_ACTIVE',
    "experience_level" TEXT NOT NULL DEFAULT 'BEGINNER',
    "lifestyle_type" TEXT NOT NULL DEFAULT 'OFFICE_WORKER',
    "sleep_window_start" TEXT,
    "sleep_window_end" TEXT,
    "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "health_conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "diet_mode" TEXT NOT NULL DEFAULT 'BALANCED',
    "workout_environment" TEXT DEFAULT 'GYM',
    "available_equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_bodybuilder_mode" BOOLEAN NOT NULL DEFAULT false,
    "is_injury_safe_mode" BOOLEAN NOT NULL DEFAULT false,
    "workout_duration_preference" INTEGER NOT NULL DEFAULT 60,
    "split_preference" TEXT NOT NULL DEFAULT 'FULL_BODY',
    "active_protocol_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "coach_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "specializations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bio" TEXT,
    "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_available" BOOLEAN NOT NULL DEFAULT false,
    "monthly_rate_usd" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "coach_client_relations" (
    "id" TEXT NOT NULL,
    "coach_user_id" TEXT NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coach_client_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_statuses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "fatigue_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "circadian_peak_time" TEXT,
    "circadian_low_time" TEXT,
    "adherence_rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "current_tdee" DOUBLE PRECISION,
    "weight_trend" TEXT,
    "last_updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "coach_profiles_user_id_key" ON "coach_profiles"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "coach_client_relations_client_user_id_idx" ON "coach_client_relations"("client_user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "coach_client_relations_coach_user_id_client_user_id_key" ON "coach_client_relations"("coach_user_id", "client_user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_statuses_user_id_key" ON "user_statuses"("user_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_preferences_user_id_fkey') THEN
    ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'coach_client_relations_coach_user_id_fkey') THEN
    ALTER TABLE "coach_client_relations" ADD CONSTRAINT "coach_client_relations_coach_user_id_fkey" FOREIGN KEY ("coach_user_id") REFERENCES "coach_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_statuses_user_id_fkey') THEN
    ALTER TABLE "user_statuses" ADD CONSTRAINT "user_statuses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
