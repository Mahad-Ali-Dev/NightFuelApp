-- Add wger-powered fields to library_exercises (idempotent)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'library_exercises' AND column_name = 'image_url') THEN
        ALTER TABLE "library_exercises" ADD COLUMN "image_url" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'library_exercises' AND column_name = 'difficulty') THEN
        ALTER TABLE "library_exercises" ADD COLUMN "difficulty" TEXT DEFAULT 'intermediate';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'library_exercises' AND column_name = 'body_part') THEN
        ALTER TABLE "library_exercises" ADD COLUMN "body_part" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'library_exercises' AND column_name = 'category') THEN
        ALTER TABLE "library_exercises" ADD COLUMN "category" TEXT;
    END IF;
END $$;
