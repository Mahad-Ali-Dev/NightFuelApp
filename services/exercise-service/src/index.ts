import 'dotenv/config';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import fastifyJwt from '@fastify/jwt';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import { PrismaClient } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { createLogger, loadConfig, connectWithRetry, registerGlobalProcessHandlers, registerFastifyErrorHandler, sendUnauthorized, assertWithinDailyLimit, AI_LIMITS, AI_QUOTA_EXCEEDED, resolvePlan, makeInternalAuthGuard } from '@nightfuel/config';
import { z } from 'zod';
import { ExerciseService } from './exercise.service';
// fetchExerciseById now used internally by ExerciseService.getLibraryExerciseById

const envSchema = z.object({
    EXERCISE_PORT: z.string().default('3011'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    REDIS_URL: z.string().url(),
    AI_PIPELINE_URL: z.string().url().default('http://ai-pipeline:3004'),
    // F22 #8: shared token for the server-to-server call to ai-pipeline
    // (sent as X-Internal-Token). Defaulted so boot doesn't break; ai-pipeline
    // rejects an empty/mismatched token, so prod must set this.
    INTERNAL_SERVICE_TOKEN: z.string().default(''),
    // Resolves the caller's plan for the AI-routine-generator daily quota.
    // Defaulted so a missing env doesn't fail boot; the service degrades to
    // plan=free if the subscription-service is unreachable (mirrors
    // chat-service resolvePlan).
    SUBSCRIPTION_SERVICE_URL: z.string().url().default('http://subscription-service:3015'),
});

const config = loadConfig(envSchema);
const logger = createLogger('exercise-service');
const prisma = new PrismaClient();
const eventBus = new RedisEventBus(config.REDIS_URL);
const exerciseSvc = new ExerciseService(prisma, eventBus);

const fastify = Fastify({ logger: false });
registerGlobalProcessHandlers(logger);
registerFastifyErrorHandler(fastify, logger);
fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

fastify.register(fastifyHelmet);
fastify.register(fastifyRateLimit, { max: 200, timeWindow: '1 minute' });
fastify.register(fastifyCors, {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
});
fastify.register(fastifyJwt, { secret: config.JWT_SECRET });

fastify.decorate('authenticate', async (request: any, reply: any) => {
    try {
        await request.jwtVerify();
    } catch (err) {
        return sendUnauthorized(reply, request, err);
    }
});

// F34 #5 / GDPR purge: guard the server-to-server-only /v1/exercises/internal/*
// routes. Constant-time X-Internal-Token compare; 404s on a missing/wrong token
// (matching the nginx edge) so a probe can't even learn the route exists. An
// unset INTERNAL_SERVICE_TOKEN fails CLOSED (every request 404s until set).
const internalAuth = makeInternalAuthGuard(config.INTERNAL_SERVICE_TOKEN);

// ── Shared exercise body schema ───────────────────────────────────────────────
// Numeric fields are positive and capped: additive upper bounds only, so valid
// app payloads stay valid while absurd/abusive values (negatives already blocked
// by positive(); now also gigantic numbers) are rejected with a 400.
const exerciseItemSchema = z.object({
    name: z.string().min(1).max(120),
    muscleGroup: z.string().max(120).optional(),
    sets: z.number().int().positive().max(100).optional().nullable(),
    reps: z.number().int().positive().max(1000).optional().nullable(),
    weightKg: z.number().positive().max(1000).optional().nullable(),
    distanceKm: z.number().positive().max(1000).optional().nullable(),
    durationSecs: z.number().int().positive().max(86400).optional().nullable(),
    restSecs: z.number().int().positive().max(86400).optional().nullable(),
    order: z.number().int().min(0).max(1000).optional(),
});

const createWorkoutSchema = z.object({
    type: z.string().min(1).max(60),
    title: z.string().min(1).max(120),
    duration: z.number().int().positive().max(86400),
    intensity: z.string().min(1).max(60),
    splitType: z.string().max(60).optional().nullable(),
    muscleGroups: z.array(z.string().max(60)).max(50).optional(),
    caloriesBurned: z.number().int().positive().max(100000).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    scheduledAt: z.string().datetime().optional().nullable(),
    completedAt: z.string().datetime().optional().nullable(),
    exercises: z.array(exerciseItemSchema).min(1).max(100),
});

// ── Routes ────────────────────────────────────────────────────────────────────

fastify.get('/health', async () => ({ status: 'ok', service: 'exercise-service' }));

// GET /v1/exercises/library?query=...
fastify.withTypeProvider<ZodTypeProvider>().get('/v1/exercises/library', {
    onRequest: [(fastify as any).authenticate],
    schema: {
        querystring: z.object({
            // Free-text filters flow into a DB `contains` (LIKE) where-clause, so
            // bound their length: .trim() is additive/harmless (drops surrounding
            // whitespace) and .max(120) is consistent with the other text caps in
            // this service (muscleGroup/name elsewhere). This closes a cheap
            // DoS / log-bloat vector where a multi-MB filter string would flow
            // unbounded into the query; realistic filter values are a few words.
            query: z.string().trim().max(120).optional(),
            equipment: z.string().trim().max(120).optional(),
            muscleGroup: z.string().trim().max(120).optional(),
            // bodyPart filter for the ExerciseDB body-part keys
            // (e.g. "upper arms", "waist", "upper legs", "hips")
            bodyPart: z.string().trim().max(120).optional(),
            category: z.string().trim().max(120).optional(),
            // Gender filter (Male/Female). NULL-gender (unisex) rows always match
            // so both genders see the shared catalog; gendered rows narrow the rest.
            gender: z.enum(['Male', 'Female']).optional(),
            // Difficulty refinement — case-insensitive contains (Beginner/Intermediate/Advanced).
            difficulty: z.string().trim().max(40).optional(),
            // Bumped max 100 → 500 → 5000. The seeded LibraryExercise table now
            // holds ~2,232 entries; a 500 cap meant the mobile library could
            // only ever fetch the first 500 (the app appeared to "miss"
            // thousands of exercises). 5000 comfortably covers the full catalog
            // with headroom, so an unfiltered fetch returns everything. The
            // .min(1)/.int() bounds and default(50) are unchanged.
            limit: z.coerce.number().int().min(1).max(5000).default(50),
        })
    },
}, async (request, reply) => {
    try {
        const { query, equipment, muscleGroup, bodyPart, category, gender, difficulty, limit } = request.query;
        return reply.send(await exerciseSvc.searchLibrary({ query, equipment, muscleGroup, bodyPart, category, gender, difficulty }, limit));
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// GET /v1/exercises/library/:id
fastify.withTypeProvider<ZodTypeProvider>().get('/v1/exercises/library/:id', {
    onRequest: [(fastify as any).authenticate],
    schema: { params: z.object({ id: z.string().min(1) }) },
}, async (request, reply) => {
    try {
        const { id } = request.params;
        // Resolves DB UUID first, falls back to wger live fetch for legacy IDs
        const ex = await exerciseSvc.getLibraryExerciseById(id);
        if (!ex) return reply.code(404).send({ error: 'Exercise not found' });
        return reply.send(ex);
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// GET /v1/exercises?limit=20
// limit cap is 500 to match GET /v1/exercises/library above (same underlying
// ExerciseDB-backed data). The mobile activity heatmap calls getRecent(200)
// -> /v1/exercises?limit=200; a 100 cap here rejected that with a 400 on every
// load while the library route (max 500) accepted the identical 200.
fastify.withTypeProvider<ZodTypeProvider>().get('/v1/exercises', {
    onRequest: [(fastify as any).authenticate],
    schema: { querystring: z.object({ limit: z.coerce.number().int().min(1).max(500).default(20) }) },
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        const { limit } = request.query;
        return reply.send(await exerciseSvc.listWorkouts(userId, limit));
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// GET /v1/exercises/:id
fastify.withTypeProvider<ZodTypeProvider>().get('/v1/exercises/:id', {
    onRequest: [(fastify as any).authenticate],
    schema: { params: z.object({ id: z.string().uuid() }) },
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        const { id } = request.params;
        const workout = await exerciseSvc.getWorkout(id, userId);
        if (!workout) return reply.code(404).send({ error: 'Workout not found' });
        return reply.send(workout);
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// POST /v1/exercises
fastify.withTypeProvider<ZodTypeProvider>().post('/v1/exercises', {
    onRequest: [(fastify as any).authenticate],
    schema: { body: createWorkoutSchema },
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        const workout = await exerciseSvc.createWorkout({ ...request.body, userId });
        return reply.code(201).send(workout);
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// DELETE /v1/exercises/:id
fastify.withTypeProvider<ZodTypeProvider>().delete('/v1/exercises/:id', {
    onRequest: [(fastify as any).authenticate],
    schema: { params: z.object({ id: z.string().uuid() }) },
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        const { id } = request.params;
        const deleted = await exerciseSvc.deleteWorkout(id, userId);
        if (!deleted) return reply.code(404).send({ error: 'Workout not found' });
        return reply.code(204).send();
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// ── Heatmap & Analytics ───────────────────────────────────────────────────────

fastify.withTypeProvider<ZodTypeProvider>().get('/v1/exercises/history/heatmap', {
    onRequest: [(fastify as any).authenticate],
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        return reply.send(await exerciseSvc.getHeatmap(userId));
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// ── AI Coach plan persistence — one per-user blob (the generated challenge +
// progress) so the mobile coachStore survives reinstalls + syncs across devices.
fastify.withTypeProvider<ZodTypeProvider>().get('/v1/exercises/coach-plan', {
    onRequest: [(fastify as any).authenticate],
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        const row = await prisma.coachPlan.findUnique({ where: { userId } });
        return reply.send(row?.data ?? null);
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

fastify.withTypeProvider<ZodTypeProvider>().put('/v1/exercises/coach-plan', {
    onRequest: [(fastify as any).authenticate],
    schema: { body: z.object({ plan: z.any() }) },
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        const { plan } = request.body as { plan: any };
        await prisma.coachPlan.upsert({ where: { userId }, create: { userId, data: plan }, update: { data: plan } });
        return reply.send({ ok: true });
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

fastify.withTypeProvider<ZodTypeProvider>().get('/v1/exercises/analytics/:exerciseName', {
    onRequest: [(fastify as any).authenticate],
    schema: { params: z.object({ exerciseName: z.string().min(1) }) },
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        const { exerciseName } = request.params;
        return reply.send(await exerciseSvc.getExerciseAnalytics(userId, exerciseName));
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// ── Routines ──────────────────────────────────────────────────────────────────

// A configured routine exercise. Bounded fields close the abuse surface where
// the client `exercises` array used to be z.array(z.any()) and was spread blind
// into Prisma. `.passthrough()` keeps any extra app-supplied display fields, but
// the array length and the known numeric fields are now bounded.
const routineExerciseSchema = z.object({
    name: z.string().min(1).max(120),
    sets: z.number().int().min(0).max(100).optional(),
    reps: z.number().int().min(0).max(1000).optional(),
    weightKg: z.number().min(0).max(1000).optional(),
    // The id of the matched LibraryExercise row (resolved server-side from the
    // exercise name in the AI generator below), or null when no catalogue row
    // matched. Declared so it survives validation/.passthrough() into
    // createRoutine's JSON `exercises` column and back out via getRoutines —
    // the mobile workout screen reads it to render a rich, tappable card.
    libraryId: z.string().nullable().optional(),
}).passthrough();

const createRoutineSchema = z.object({
    title: z.string().min(1).max(120),
    description: z.string().max(2000).optional().nullable(),
    splitType: z.string().max(60).optional().nullable(),
    muscleGroups: z.array(z.string().max(60)).max(50).optional(),
    exercises: z.array(routineExerciseSchema).max(50).optional(),
});

fastify.withTypeProvider<ZodTypeProvider>().get('/v1/exercises/routines', {
    onRequest: [(fastify as any).authenticate],
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        return reply.send(await exerciseSvc.getRoutines(userId));
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

fastify.withTypeProvider<ZodTypeProvider>().post('/v1/exercises/routines', {
    onRequest: [(fastify as any).authenticate],
    schema: { body: createRoutineSchema },
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        return reply.code(201).send(await exerciseSvc.createRoutine(userId, request.body));
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// ── AI Routine Generator ──────────────────────────────────────────────────────

// goal/level/daysPerWeek are already bounded by enum/range. The two free-text
// inputs (focusAreas[], equipment) flow into the AI prompt and createRoutine, so
// bound their length too — short tags, capped array — to keep the prompt small
// and reject abusive payloads with a clean 400.
const generateRoutineSchema = z.object({
    goal:       z.enum(['strength', 'hypertrophy', 'endurance', 'fat_loss', 'general']).default('general'),
    level:      z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
    daysPerWeek: z.number().int().min(1).max(7).default(3),
    focusAreas: z.array(z.string().max(60)).max(20).optional(),
    equipment:  z.string().max(200).optional(),
});

// Deterministic routine used when the AI pipeline is unavailable, so the
// "Generate My Plan" CTA always produces a usable routine instead of 500ing.
function buildFallbackRoutine(goal: string, level: string, daysPerWeek: number, focusAreas?: string[], equipment?: string) {
    const scheme = goal === 'strength' ? { sets: 5, reps: 5 }
        : goal === 'endurance' ? { sets: 3, reps: 15 }
        : goal === 'fat_loss' ? { sets: 3, reps: 12 }
        : { sets: 4, reps: 10 };
    const bodyweight = !equipment || /body|home|none|band/i.test(equipment);
    const GYM = ['Barbell Squat', 'Bench Press', 'Deadlift', 'Overhead Press', 'Barbell Row', 'Lat Pulldown', 'Leg Press', 'Dumbbell Curl'];
    const HOME = ['Push Up', 'Bodyweight Squat', 'Walking Lunge', 'Plank', 'Glute Bridge', 'Pike Push Up', 'Mountain Climbers', 'Burpee'];
    const pool = bodyweight ? HOME : GYM;
    const count = Math.min(pool.length, 5 + Math.max(0, daysPerWeek - 2));
    const exercises = pool.slice(0, count).map((name) => ({ name, sets: scheme.sets, reps: scheme.reps }));
    return {
        title: `${level[0].toUpperCase()}${level.slice(1)} ${goal.replace('_', ' ')} plan`,
        description: `A balanced ${daysPerWeek}-day ${goal.replace('_', ' ')} routine${bodyweight ? ' (no equipment needed)' : ''}.`,
        splitType: daysPerWeek >= 4 ? 'UPPER_LOWER' : 'FULL_BODY',
        muscleGroups: focusAreas && focusAreas.length ? focusAreas : ['full body'],
        exercises,
    };
}

// Resolve a single free-text exercise NAME to a real seeded LibraryExercise row
// id, so an AI/fallback routine renders the same rich demo/thumbnail cards as
// the exercise library. Strategy mirrors the library search ranking:
//   1. case-insensitive EXACT name match (the AI is prompted with catalogue-style
//      names, so most resolve here);
//   2. else case-insensitive CONTAINS match (handles minor wording drift, e.g.
//      "Barbell Bench Press" → seeded "Barbell Bench Press - Medium Grip").
// Returns the matched row id, or null when nothing matched — the caller keeps
// the exercise either way (a null id renders a graceful text-only card client-
// side), so an unknown movement is NEVER dropped from the routine.
async function resolveLibraryId(name: string): Promise<string | null> {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return null;
    const exact = await prisma.libraryExercise.findFirst({
        where: { name: { equals: trimmed, mode: 'insensitive' } },
        select: { id: true },
    });
    if (exact) return exact.id;
    const partial = await prisma.libraryExercise.findFirst({
        where: { name: { contains: trimmed, mode: 'insensitive' } },
        select: { id: true },
    });
    return partial?.id ?? null;
}

fastify.withTypeProvider<ZodTypeProvider>().post('/v1/exercises/routines/generate', {
    onRequest: [(fastify as any).authenticate],
    schema: { body: generateRoutineSchema },
}, async (request, reply) => {
    const userId = (request.user as any).userId ?? (request.user as any).id;
    const { goal, level, daysPerWeek, focusAreas, equipment } = request.body;

    // ── Daily AI quota — gated BEFORE the AI-pipeline fetch / any createRoutine ──
    // Only AI-generated routines count toward the per-plan `generations` quota:
    // the count filters on aiGenerated:true, and this generate route is the only
    // path that writes aiGenerated:true (it calls createRoutine(...,true) below).
    // Manual creates (POST /v1/exercises/routines) write aiGenerated:false, so they
    // do NOT consume this quota. At/over the cap we reply 429 and DO NOT call the
    // AI pipeline or createRoutine. Plan tier is resolved the same way the
    // chat-service Ria quota does; an unreachable subscription-service degrades to
    // the safer free limit.
    // resolver centralized into @nightfuel/config; the shared token mints {userId,
    // sub} — a compatible superset (subscription-service reads only userId/id), so
    // chat's old role:'SYSTEM'/no-sub and exercise/plan's sub/no-role both reduce to
    // behavior-identical at /me. The shared fn mints via jwtSecret, so this path no
    // longer reaches into (fastify as any).jwt.
    const plan = await resolvePlan({
        userId,
        jwtSecret: config.JWT_SECRET,
        subscriptionServiceUrl: config.SUBSCRIPTION_SERVICE_URL,
        timeoutMs: 3000,
    });
    const now = new Date();
    const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const usedToday = await prisma.workoutRoutine.count({
        where: { userId, aiGenerated: true, createdAt: { gte: startOfUtcDay } },
    });
    const limit = AI_LIMITS[plan].generations;
    const q = assertWithinDailyLimit({ usedToday, limit, now });
    if (!q.allowed) {
        return reply.code(429).send({ error: AI_QUOTA_EXCEEDED, limit, plan, resetsAt: q.resetsAt });
    }

    // Build a structured prompt for the AI pipeline
    const prompt = [
        `Generate a ${daysPerWeek}-day per week ${level} ${goal} workout routine.`,
        focusAreas?.length ? `Focus areas: ${focusAreas.join(', ')}.` : '',
        equipment ? `Available equipment: ${equipment}.` : 'Assume full gym access.',
        '',
        'Respond with a JSON object ONLY (no markdown). Format:',
        '{"title":"...","description":"...","splitType":"...","muscleGroups":["..."],"exercises":[{"name":"...","sets":3,"reps":10}]}',
    ].filter(Boolean).join('\n');

    let routineData: any = null;
    try {
        // Call AI pipeline chat endpoint. NOTE: the ai-pipeline router is mounted
        // at /v1/ai, so the path must be /v1/ai/chat (a bare /chat 404s — this
        // routine generator silently fell back to the deterministic template on
        // every call until this was corrected).
        const aiRes = await fetch(`${config.AI_PIPELINE_URL}/v1/ai/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Token': config.INTERNAL_SERVICE_TOKEN,
            },
            body: JSON.stringify({
                userId,
                message: prompt,
                history: [],
                context: { goal, level, daysPerWeek, focusAreas, equipment },
            }),
            signal: AbortSignal.timeout(45_000),
        });

        if (!aiRes.ok) throw new Error(`AI pipeline returned ${aiRes.status}`);

        const aiBody = await aiRes.json() as { reply: string };
        const jsonMatch = aiBody.reply.match(/\{[\s\S]*\}/);
        if (jsonMatch) routineData = JSON.parse(jsonMatch[0]);
    } catch (err: any) {
        logger.warn({ err: err?.message }, 'AI routine generation unavailable — using deterministic fallback');
    }

    // If the AI was unreachable or returned no usable exercises, fall back to a
    // deterministic template so the CTA always succeeds instead of 500ing.
    if (!routineData || !Array.isArray(routineData.exercises) || routineData.exercises.length === 0) {
        routineData = buildFallbackRoutine(goal, level, daysPerWeek, focusAreas, equipment);
    }
    routineData.title ??= `${goal} routine`;
    routineData.exercises ??= [];

    // Resolve every exercise NAME (from BOTH the AI and the deterministic
    // fallback path — they converge here) to a real seeded LibraryExercise id so
    // the workout screen can render thumbnails/demos and deep-link to the
    // exercise detail. An unmatched name keeps libraryId:null (never dropped).
    // Sequential awaits keep the per-routine query count tiny (<= ~8 short
    // indexed lookups) and avoid a connection-pool burst.
    if (Array.isArray(routineData.exercises)) {
        for (const ex of routineData.exercises) {
            if (ex && typeof ex === 'object' && typeof ex.name === 'string') {
                ex.libraryId = await resolveLibraryId(ex.name);
            }
        }
    }

    try {
        // aiGenerated:true — this is the AI generator path, so the row counts
        // toward the daily AI quota above. Manual creates pass the default false.
        const created = await exerciseSvc.createRoutine(userId, routineData, true);

        // BUG #6: announce the generated routine so notification-service can fire a
        // PLAN_READY ("Your workout plan is ready") notification + push. Non-blocking:
        // a Redis hiccup must never fail the 201 the client is waiting on (mirrors the
        // plan-service plan.generated publish pattern). Raw string channel — no
        // @nightfuel/types Channels constant exists for it (that package is owned
        // elsewhere); the literal is kept in sync with notification-service's
        // WORKOUT_GENERATED_CHANNEL subscriber.
        try {
            await eventBus.publish('nightfuel:exercise:routine-generated', {
                eventId: crypto.randomUUID(),
                eventType: 'exercise.routine-generated',
                producedAt: new Date().toISOString(),
                producerService: 'exercise-service',
                correlationId: crypto.randomUUID(),
                userId,
                payload: {
                    routineId: (created as any)?.id,
                    title: (created as any)?.title ?? routineData.title,
                },
            });
        } catch (pubErr: any) {
            logger.warn({ err: pubErr?.message }, 'Failed to publish exercise.routine-generated event (non-fatal)');
        }

        return reply.code(201).send(created);
    } catch (err: any) {
        logger.error({ err }, 'AI routine persistence failed');
        return reply.code(500).send({ error: 'Failed to save routine. Please try again.' });
    }
});

// ── 1RM Logs ──────────────────────────────────────────────────────────────────

// weightKg / estimated1RMKg are positive and capped at 1000 kg (mirrors the
// weightKg bound elsewhere — no human lift exceeds it, so it only blocks abuse).
const logOneRepMaxSchema = z.object({
    exerciseName: z.string().min(1).max(120),
    weightKg: z.number().positive().max(1000),
    estimated1RMKg: z.number().positive().max(1000)
});

fastify.withTypeProvider<ZodTypeProvider>().get('/v1/exercises/1rm', {
    onRequest: [(fastify as any).authenticate],
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        return reply.send(await exerciseSvc.getOneRepMaxes(userId));
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

fastify.withTypeProvider<ZodTypeProvider>().post('/v1/exercises/1rm', {
    onRequest: [(fastify as any).authenticate],
    schema: { body: logOneRepMaxSchema },
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        return reply.code(201).send(await exerciseSvc.logOneRepMax(userId, request.body));
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// ── Workout Sessions ──────────────────────────────────────────────────────────

// routineId is an optional FK to a routine row. Bound its length (a UUID is 36
// chars; 64 leaves slack for any legacy id format) so an unbounded blob can't be
// spread into the create. Left as a free string rather than .uuid() to keep any
// loosely-formed client id passing — an unknown id still fails at the FK.
const startSessionSchema = z.object({
    routineId: z.string().max(64).optional()
});

fastify.withTypeProvider<ZodTypeProvider>().post('/v1/exercises/session/start', {
    onRequest: [(fastify as any).authenticate],
    schema: { body: startSessionSchema }
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        return reply.code(201).send(await exerciseSvc.startSession(userId, request.body.routineId));
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

fastify.withTypeProvider<ZodTypeProvider>().get('/v1/exercises/session/active', {
    onRequest: [(fastify as any).authenticate]
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        const session = await exerciseSvc.getActiveSession(userId);
        if (!session) return reply.code(404).send({ error: 'No active session' });
        return reply.send(session);
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// Upper bounds mirror exerciseItemSchema (sets ≤100, reps ≤1000, weightKg ≤1000,
// durationSecs ≤86400 = 24h) so a logged set can't carry absurd/abusive numbers
// into the session-exercise row. min(0)+default(0) keep every valid client
// payload (including omitted fields) passing.
const logSessionExerciseSchema = z.object({
    exerciseName: z.string().min(1).max(120),
    sets: z.number().int().min(0).max(100).default(0),
    reps: z.number().int().min(0).max(1000).default(0),
    weightKg: z.number().min(0).max(1000).default(0),
    durationSecs: z.number().int().min(0).max(86400).default(0)
});

fastify.withTypeProvider<ZodTypeProvider>().post('/v1/exercises/session/:id/exercise/log', {
    onRequest: [(fastify as any).authenticate],
    schema: {
        params: z.object({ id: z.string().uuid() }),
        body: logSessionExerciseSchema
    }
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        const { id } = request.params;
        const log = await exerciseSvc.logSessionExercise(
            id,
            userId,
            request.body.exerciseName,
            request.body.sets,
            request.body.reps,
            request.body.weightKg,
            request.body.durationSecs
        );
        // null = the session doesn't exist or isn't the caller's (IDOR guard).
        if (!log) return reply.code(404).send({ error: 'Session not found' });
        return reply.code(201).send(log);
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

fastify.withTypeProvider<ZodTypeProvider>().post('/v1/exercises/session/:id/end', {
    onRequest: [(fastify as any).authenticate],
    schema: { params: z.object({ id: z.string().uuid() }) }
}, async (request, reply) => {
    try {
        const userId = (request.user as any).userId ?? (request.user as any).id;
        const { id } = request.params;
        const session = await exerciseSvc.endSession(id, userId);
        // null = the session doesn't exist or isn't the caller's (IDOR guard).
        if (!session) return reply.code(404).send({ error: 'Session not found' });
        return reply.send(session);
    } catch (err: any) {
        logger.error(err);
        return reply.code(500).send({ error: 'An unexpected error occurred' });
    }
});

// ── DELETE /v1/exercises/internal/user/:userId (GDPR purge) ─────────────────────
// Server-to-server only (nginx 404s /v1/<svc>/internal/* at the edge; the
// internalAuth preHandler additionally requires X-Internal-Token). PERMANENTLY
// erases EVERY exercise-service row owned by :userId across all four user-owned
// tables (workouts, workout_routines, 1rm_logs, workout_sessions) — child rows in
// exercises / exercise_logs are removed via their parent's onDelete: Cascade.
// IDEMPOTENT: purging a user with no rows returns 200 with zero counts; purging
// twice is safe (deleteMany never throws on zero rows). Returns a per-table
// deletedCounts summary.
fastify.withTypeProvider<ZodTypeProvider>().delete('/v1/exercises/internal/user/:userId', {
    preHandler: internalAuth,
    schema: { params: z.object({ userId: z.string().uuid() }) },
}, async (request, reply) => {
    const { userId } = request.params;
    try {
        const deletedCounts = await exerciseSvc.purgeUser(userId);
        return reply.code(200).send({ userId, deletedCounts });
    } catch (err: any) {
        request.log.error({ err, userId }, 'GDPR purge failed');
        return reply.code(500).send({ error: 'Internal server error' });
    }
});

// ── GET /v1/exercises/internal/user/:userId/export (GDPR data export) ────────────
// Read-only counterpart of the purge above, behind the SAME internalAuth guard
// (X-Internal-Token; 404s without/with a wrong token, fails CLOSED on an empty
// expected token). Server-to-server only (nginx 404s /v1/<svc>/internal/* at the
// edge). RETURNS every exercise-service row owned by :userId across the SAME
// user-owned tables the purge erases (workouts, workout_routines, 1rm_logs,
// workout_sessions) — keyed by table name, with the cascade-child rows (exercises,
// exercise_logs) nested under their parent — so right-to-access and right-to-erasure
// cover identical data. IDEMPOTENT & read-only: no writes; each table is bounded
// (EXPORT_ROW_LIMIT, see ExerciseService.exportUser) with a `_meta` truncation
// flag. NEVER exports any secret/credential column (this service holds none).
fastify.withTypeProvider<ZodTypeProvider>().get('/v1/exercises/internal/user/:userId/export', {
    preHandler: internalAuth,
    schema: { params: z.object({ userId: z.string().uuid() }) },
}, async (request, reply) => {
    const { userId } = request.params;
    try {
        const data = await exerciseSvc.exportUser(userId);
        return reply.code(200).send({ userId, data });
    } catch (err: any) {
        request.log.error({ err, userId }, 'GDPR export failed');
        return reply.code(500).send({ error: 'Internal server error' });
    }
});

// ── Startup ───────────────────────────────────────────────────────────────────


const start = async () => {
    try {
        await connectWithRetry(prisma, logger);
        logger.info('exercise-service: connected to database');

        await fastify.listen({ port: parseInt(config.EXERCISE_PORT), host: '0.0.0.0' });
        logger.info(`exercise-service listening on port ${config.EXERCISE_PORT}`);
    } catch (err) {
        logger.error(err);
        process.exit(1);
    }
};

const shutdown = async () => {
    await fastify.close();
    await eventBus.disconnect();
    await prisma.$disconnect();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();
