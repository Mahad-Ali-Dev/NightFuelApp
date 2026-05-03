-- State Service — safe idempotent init migration
-- Creates only state-specific tables using IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "user_states" (
    "id"                       TEXT             NOT NULL,
    "user_id"                  TEXT             NOT NULL,
    "last_7_days_adherence"    DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "avg_sleep_quality"        DOUBLE PRECISION NOT NULL DEFAULT 7.0,
    "fatigue_level"            DOUBLE PRECISION NOT NULL DEFAULT 3.0,
    "current_weight_kg"        DOUBLE PRECISION,
    "target_weight_kg"         DOUBLE PRECISION,
    "current_calorie_target"   DOUBLE PRECISION,
    "current_protein_target_g" DOUBLE PRECISION,
    "training_phase"           TEXT             NOT NULL DEFAULT 'HYPERTROPHY',
    "cycle_week"               INTEGER          NOT NULL DEFAULT 1,
    "last_event_id"            TEXT,
    "last_processed_at"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"               TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_states_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "user_states" ADD CONSTRAINT "user_states_user_id_key" UNIQUE ("user_id");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
