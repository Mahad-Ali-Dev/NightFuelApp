-- Badge & Achievement System migration
-- Creates badges and user_badges tables (idempotent)

CREATE TABLE IF NOT EXISTS "badges" (
    "id"          TEXT         NOT NULL,
    "key"         TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT         NOT NULL,
    "icon_emoji"  TEXT         NOT NULL,
    "tier"        TEXT         NOT NULL DEFAULT 'bronze',
    "xp_reward"   INTEGER      NOT NULL DEFAULT 0,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "badges" ADD CONSTRAINT "badges_key_key" UNIQUE ("key");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "user_badges" (
    "id"         TEXT         NOT NULL,
    "user_id"    TEXT         NOT NULL,
    "badge_id"   TEXT         NOT NULL,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seen"       BOOLEAN      NOT NULL DEFAULT false,
    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

DO $$ BEGIN
    ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_badge_id_key" UNIQUE ("user_id", "badge_id");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "user_badges_user_id_idx" ON "user_badges"("user_id");

-- Seed the badge catalog (idempotent via ON CONFLICT DO NOTHING)
INSERT INTO "badges" ("id", "key", "name", "description", "icon_emoji", "tier", "xp_reward") VALUES
    (gen_random_uuid()::text, 'first_post',         'First Post',          'Published your first post to the community',         '📝', 'bronze',   50),
    (gen_random_uuid()::text, 'social_butterfly',   'Social Butterfly',    'Received 50 total likes on your posts',               '🦋', 'silver',  100),
    (gen_random_uuid()::text, 'conversationalist',  'Conversationalist',   'Left 20 comments on community posts',                 '💬', 'bronze',   50),
    (gen_random_uuid()::text, 'challenge_starter',  'Challenge Starter',   'Joined your first community challenge',               '🌟', 'bronze',   50),
    (gen_random_uuid()::text, 'challenge_champion', 'Challenge Champion',  'Completed 5 community challenges',                   '🏆', 'gold',    500),
    (gen_random_uuid()::text, 'power_user',         'Power User',          'Earned 500 XP through your fitness journey',         '⚡', 'silver',  100),
    (gen_random_uuid()::text, 'on_fire',            'On Fire',             'Accumulated 1,000 XP — you''re blazing!',            '🔥', 'gold',    250),
    (gen_random_uuid()::text, 'elite',              'Elite',               'Reached 5,000 XP — an elite NightFuel athlete',      '💎', 'platinum', 500),
    (gen_random_uuid()::text, 'newcomer',           'Newcomer',            'Reached Level 5',                                    '🥉', 'bronze',   50),
    (gen_random_uuid()::text, 'veteran',            'Veteran',             'Reached Level 10',                                   '🥈', 'silver',  150),
    (gen_random_uuid()::text, 'legend',             'Legend',              'Reached Level 20 — a true NightFuel legend',         '🥇', 'gold',    500),
    (gen_random_uuid()::text, 'night_owl',          'Night Owl',           'Logged a workout between midnight and 5 AM',         '🦉', 'silver',  100),
    (gen_random_uuid()::text, 'consistent',         'Consistent',          'Completed challenges 3 weeks in a row',              '📅', 'silver',  150)
ON CONFLICT ("key") DO NOTHING;
