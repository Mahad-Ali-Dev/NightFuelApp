-- Exercise Service Init Migration (idempotent)

-- Add missing columns to existing workouts table
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workouts' AND column_name = 'type') THEN
        ALTER TABLE "workouts" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'STRENGTH';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workouts' AND column_name = 'title') THEN
        ALTER TABLE "workouts" ADD COLUMN "title" TEXT NOT NULL DEFAULT 'Untitled Workout';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workouts' AND column_name = 'duration') THEN
        ALTER TABLE "workouts" ADD COLUMN "duration" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workouts' AND column_name = 'intensity') THEN
        ALTER TABLE "workouts" ADD COLUMN "intensity" TEXT NOT NULL DEFAULT 'MODERATE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workouts' AND column_name = 'split_type') THEN
        ALTER TABLE "workouts" ADD COLUMN "split_type" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workouts' AND column_name = 'muscle_groups') THEN
        ALTER TABLE "workouts" ADD COLUMN "muscle_groups" TEXT[];
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workouts' AND column_name = 'calories_burned') THEN
        ALTER TABLE "workouts" ADD COLUMN "calories_burned" INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workouts' AND column_name = 'total_volume') THEN
        ALTER TABLE "workouts" ADD COLUMN "total_volume" DOUBLE PRECISION;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workouts' AND column_name = 'notes') THEN
        ALTER TABLE "workouts" ADD COLUMN "notes" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workouts' AND column_name = 'scheduled_at') THEN
        ALTER TABLE "workouts" ADD COLUMN "scheduled_at" TIMESTAMP(3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workouts' AND column_name = 'completed_at') THEN
        ALTER TABLE "workouts" ADD COLUMN "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workouts' AND column_name = 'created_at') THEN
        ALTER TABLE "workouts" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'workouts' AND column_name = 'updated_at') THEN
        ALTER TABLE "workouts" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Detect id type on workouts table and create exercises table accordingly
DO $$
DECLARE
    id_type TEXT;
BEGIN
    SELECT data_type INTO id_type FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'id';

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'exercises') THEN
        IF id_type = 'uuid' THEN
            CREATE TABLE "exercises" (
                "id" UUID NOT NULL DEFAULT gen_random_uuid(),
                "workout_id" UUID NOT NULL,
                "name" TEXT NOT NULL,
                "muscle_group" TEXT NOT NULL DEFAULT 'FULL_BODY',
                "sets" INTEGER,
                "reps" INTEGER,
                "weight_kg" DOUBLE PRECISION,
                "distance_km" DOUBLE PRECISION,
                "duration_secs" INTEGER,
                "rest_secs" INTEGER,
                "order" INTEGER NOT NULL DEFAULT 0,
                CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
            );
        ELSE
            CREATE TABLE "exercises" (
                "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
                "workout_id" TEXT NOT NULL,
                "name" TEXT NOT NULL,
                "muscle_group" TEXT NOT NULL DEFAULT 'FULL_BODY',
                "sets" INTEGER,
                "reps" INTEGER,
                "weight_kg" DOUBLE PRECISION,
                "distance_km" DOUBLE PRECISION,
                "duration_secs" INTEGER,
                "rest_secs" INTEGER,
                "order" INTEGER NOT NULL DEFAULT 0,
                CONSTRAINT "exercises_pkey" PRIMARY KEY ("id")
            );
        END IF;
    END IF;
END $$;

-- CreateTable library_exercises
CREATE TABLE IF NOT EXISTS "library_exercises" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "name" TEXT NOT NULL,
    "muscle_group" TEXT NOT NULL,
    "equipment" TEXT,
    "instructions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "library_exercises_pkey" PRIMARY KEY ("id")
);

-- CreateTable workout_routines
CREATE TABLE IF NOT EXISTS "workout_routines" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "user_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "split_type" TEXT,
    "muscle_groups" TEXT[],
    "exercises" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "workout_routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable 1rm_logs
CREATE TABLE IF NOT EXISTS "1rm_logs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "user_id" TEXT NOT NULL,
    "exercise_name" TEXT NOT NULL,
    "weight_kg" DOUBLE PRECISION NOT NULL,
    "estimated_1rm_kg" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "1rm_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "workouts_user_id_idx" ON "workouts"("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "library_exercises_name_key" ON "library_exercises"("name");
CREATE INDEX IF NOT EXISTS "workout_routines_user_id_idx" ON "workout_routines"("user_id");

-- AddForeignKey exercises -> workouts
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exercises_workout_id_fkey') THEN
        ALTER TABLE "exercises" ADD CONSTRAINT "exercises_workout_id_fkey"
        FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
