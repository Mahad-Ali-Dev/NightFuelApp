-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('FIXED_NIGHT', 'ROTATING', 'SPLIT', 'IRREGULAR', 'TWELVE_HOUR');

-- CreateEnum
CREATE TYPE "Intensity" AS ENUM ('SEDENTARY', 'MODERATE', 'DEMANDING');

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "shift_date" DATE NOT NULL,
    "start_time" TIMESTAMPTZ NOT NULL,
    "end_time" TIMESTAMPTZ NOT NULL,
    "shift_type" "ShiftType" NOT NULL,
    "sleep_window_start" TIMESTAMPTZ,
    "sleep_window_end" TIMESTAMPTZ,
    "work_intensity" "Intensity" NOT NULL DEFAULT 'MODERATE',
    "commute_minutes" INTEGER NOT NULL DEFAULT 0,
    "is_day_off" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rotation_patterns" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pattern_name" TEXT NOT NULL DEFAULT 'Default',
    "cycle_days" INTEGER NOT NULL,
    "pattern" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rotation_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shifts_user_id_shift_date_idx" ON "shifts"("user_id", "shift_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "shifts_user_id_shift_date_key" ON "shifts"("user_id", "shift_date");

-- CreateIndex
CREATE INDEX "rotation_patterns_user_id_idx" ON "rotation_patterns"("user_id");
