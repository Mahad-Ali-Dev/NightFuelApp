-- Enable pg_trgm extension for trigram-based ILIKE search (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN trigram index on name — makes "ILIKE '%squat%'" fast at 870+ rows
CREATE INDEX IF NOT EXISTS "library_exercises_name_trgm_idx"
  ON "library_exercises" USING GIN ("name" gin_trgm_ops);

-- GIN trigram index on muscle_group — supports "ILIKE '%chest%'" filters
CREATE INDEX IF NOT EXISTS "library_exercises_muscle_group_trgm_idx"
  ON "library_exercises" USING GIN ("muscle_group" gin_trgm_ops);

-- B-tree index on category — supports exact category = 'gym' | 'home' | 'cardio' | 'kegel'
CREATE INDEX IF NOT EXISTS "library_exercises_category_idx"
  ON "library_exercises" ("category");
