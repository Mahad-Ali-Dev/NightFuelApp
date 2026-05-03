-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "date_of_birth" DATE,
    "height_cm" DOUBLE PRECISION,
    "weight_kg" DOUBLE PRECISION,
    "biological_sex" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "onboarding_step" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "primary_goal" TEXT NOT NULL DEFAULT 'ENERGY',
    "dietary_preference" TEXT NOT NULL DEFAULT 'ANY',
    "target_calories" DOUBLE PRECISION,
    "target_protein_g" DOUBLE PRECISION,
    "target_carbs_g" DOUBLE PRECISION,
    "target_fat_g" DOUBLE PRECISION,
    "activity_level" TEXT NOT NULL DEFAULT 'MODERATE',
    "experience_level" TEXT NOT NULL DEFAULT 'BEGINNER',
    "lifestyle_type" TEXT NOT NULL DEFAULT 'OFFICE',
    "sleep_window_start" TEXT,
    "sleep_window_end" TEXT,
    "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_key" ON "user_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
