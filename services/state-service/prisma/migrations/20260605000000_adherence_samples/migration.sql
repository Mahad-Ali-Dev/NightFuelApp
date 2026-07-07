-- Rolling window of recent adherence samples used to compute last_7_days_adherence.
ALTER TABLE "user_states" ADD COLUMN "adherence_samples" JSONB NOT NULL DEFAULT '[]';
