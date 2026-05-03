-- Sleep Service — safe idempotent init migration
-- Creates only sleep-specific tables using IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "sleep_sessions" (
    "id"                       TEXT        NOT NULL,
    "user_id"                  TEXT        NOT NULL,
    "start_time"               TIMESTAMP(3) NOT NULL,
    "end_time"                 TIMESTAMP(3),
    "duration_mins"            INTEGER,
    "quality"                  INTEGER,
    "disturbances"             INTEGER     NOT NULL DEFAULT 0,
    "source"                   TEXT        NOT NULL DEFAULT 'MANUAL',
    "circadian_alignment_score" INTEGER,
    "notes"                    TEXT,
    "created_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"               TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sleep_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "sleep_preferences" (
    "id"                TEXT             NOT NULL,
    "user_id"           TEXT             NOT NULL,
    "target_duration"   INTEGER          NOT NULL DEFAULT 480,
    "wind_down_duration" INTEGER         NOT NULL DEFAULT 30,
    "temperature_target" DOUBLE PRECISION,
    "updated_at"        TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sleep_preferences_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "sleep_preferences" ADD CONSTRAINT "sleep_preferences_user_id_key" UNIQUE ("user_id");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
