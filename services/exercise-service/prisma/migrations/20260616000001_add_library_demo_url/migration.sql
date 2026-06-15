-- Add demo_url (curated demo video link) to library_exercises (idempotent, non-destructive)
ALTER TABLE "library_exercises" ADD COLUMN IF NOT EXISTS "demo_url" TEXT;
