-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'DELETED');

-- CreateTable
CREATE TABLE "day_plans" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_date" DATE NOT NULL,
    "shift_id" TEXT,
    "circadian_profile_id" TEXT,
    "plan_version" INTEGER NOT NULL DEFAULT 1,
    "plan" JSONB NOT NULL,
    "generation_model" TEXT NOT NULL,
    "generation_latency_ms" INTEGER,
    "generation_tokens" INTEGER,
    "user_rating" INTEGER,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "day_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "day_plans_user_id_plan_date_plan_version_key" ON "day_plans"("user_id", "plan_date", "plan_version");

-- CreateIndex
CREATE INDEX "day_plans_user_id_plan_date_idx" ON "day_plans"("user_id", "plan_date" DESC);
