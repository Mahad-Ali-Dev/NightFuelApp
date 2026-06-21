import { PrismaClient, Workout } from './generated/prisma';
import { EventBus } from '@nightfuel/events';
import { Channels, ExerciseLoggedPayload } from '@nightfuel/types';
import { createLogger, MAX_QUERY_RANGE_DAYS } from '@nightfuel/config';
import {
    searchExercisesLive,
    fetchExerciseById,
    HOME_EQUIPMENT,
    GYM_EQUIPMENT,
    CARDIO_BODY_PARTS,
    CARDIO_EQUIPMENT,
} from './exercisedb';

const logger = createLogger('exercise-service');

// ── Curated exercise demo videos ──────────────────────────────────────────────
// Keyed by the exact LibraryExercise.name. Verified full YouTube *watch* URLs.
// This mirrors prisma/demo-urls.ts (the canonical map used by the seeder); it is
// duplicated here only because the service tsconfig pins `rootDir` to `src/`,
// which forbids importing files from `prisma/`. Keep the two in sync when editing.
// The service prefers the stored `demo_url` column and falls back to this map so
// demo links work before the catalog is re-seeded.
const DEMO_URLS: Record<string, string> = {
    // Gym
    'Barbell Bench Press': 'https://www.youtube.com/watch?v=rT7DgCr-3pg',
    'Barbell Deadlift': 'https://www.youtube.com/watch?v=op9kVnSso6Q',
    'Barbell Back Squat': 'https://www.youtube.com/watch?v=ultWZbUMPL8',
    'Overhead Press': 'https://www.youtube.com/watch?v=2yjwXTZQDDI',
    'Pull-Up': 'https://www.youtube.com/watch?v=eGo4IYlbE5g',
    'Dumbbell Incline Press': 'https://www.youtube.com/watch?v=8iPEnn-ltC8',
    'Cable Lat Pulldown': 'https://www.youtube.com/watch?v=CAwf7n6Luuc',
    'Dumbbell Lateral Raise': 'https://www.youtube.com/watch?v=3VcKaXpzqRo',
    'Barbell Row': 'https://www.youtube.com/watch?v=9efgcAjQe7E',
    'Leg Press': 'https://www.youtube.com/watch?v=IZxyjW7MPJQ',
    'Romanian Deadlift': 'https://www.youtube.com/watch?v=JCXUYuzwNrM',
    'Dumbbell Bicep Curl': 'https://www.youtube.com/watch?v=ykJmrZ5v0Oo',
    'Tricep Pushdown': 'https://www.youtube.com/watch?v=2-LAMcpzODU',
    // Home
    'Push-Up': 'https://www.youtube.com/watch?v=IODxDxX7oi4',
    'Bodyweight Squat': 'https://www.youtube.com/watch?v=aclHkVaku9U',
    'Plank': 'https://www.youtube.com/watch?v=pSHjTRCQxIw',
    'Burpee': 'https://www.youtube.com/watch?v=TU8QYVW0gDU',
    'Lunges': 'https://www.youtube.com/watch?v=QOVaHwm-Q6U',
    'Pike Push-Up': 'https://www.youtube.com/watch?v=x7_I6gZDeBk',
    'Mountain Climbers': 'https://www.youtube.com/watch?v=nmwgirgXLYM',
    'Tricep Dips': 'https://www.youtube.com/watch?v=6kALZikXxLc',
    'Glute Bridge': 'https://www.youtube.com/watch?v=OUgsJ8-Vi0E',
    'Superman': 'https://www.youtube.com/watch?v=cc6UVRS7PW4',
    // Cardio
    'Jumping Jacks': 'https://www.youtube.com/watch?v=c4DAnQ6DtF8',
    'High Knees': 'https://www.youtube.com/watch?v=oDdkytliOqE',
    'Jump Rope': 'https://www.youtube.com/watch?v=u3zgHI8QnqE',
    'Box Jump': 'https://www.youtube.com/watch?v=52r_Ul5k03g',
    // Pelvic floor (Kegel)
    'Basic Kegel Squeeze': 'https://www.youtube.com/watch?v=PMHc5W2YO9o',
    'Quick-Flick Kegels': 'https://www.youtube.com/watch?v=lFKYltA2tA8',
    'Elevator Kegel': 'https://www.youtube.com/watch?v=jWj4iBxQ0Xc',
    // Keep in sync with prisma/demo-urls.ts — the demo-maps sync guard enforces parity.
    'Hammer Curls': 'https://www.youtube.com/watch?v=tjyraFISkbg',
    'Hanging Leg Raise': 'https://www.youtube.com/watch?v=Pr1ieGZ5atk',
    'Face Pull': 'https://www.youtube.com/watch?v=rep-qVOkqgk',
    'Goblet Squat': 'https://www.youtube.com/watch?v=MeIiIdhvXT4',
    'Barbell Hip Thrust': 'https://www.youtube.com/watch?v=LM8XHLYJoYs',
};

const DEMO_URLS_LC: Record<string, string> = Object.fromEntries(
    Object.entries(DEMO_URLS).map(([name, url]) => [name.toLowerCase(), url]),
);

/** Resolve a curated demo video URL by exercise name (case-insensitive, trimmed). */
function resolveDemoUrl(name: string | null | undefined): string | null {
    if (!name) return null;
    return DEMO_URLS_LC[name.trim().toLowerCase()] ?? null;
}

/**
 * Compute workout streaks from a set of active calendar days (each "YYYY-MM-DD").
 *
 * - `longestStreak`  = the maximum run of consecutive calendar days in the set.
 * - `currentStreak`  = the run of consecutive days ending **today**, or, if the
 *   user hasn't logged today yet, the run ending **yesterday** (so a streak is
 *   not reported as broken before today's workout is logged). Returns 0 if the
 *   most recent active day is older than yesterday.
 *
 * `todayKey` is injected so the function is pure and unit-testable; callers pass
 * the current date's YYYY-MM-DD. Day-keys are compared via UTC midnight, matching
 * how `getHeatmap` derives them from `completedAt.toISOString()`.
 */
export function computeStreaks(
    activeDayKeys: Iterable<string>,
    todayKey: string,
): { currentStreak: number; longestStreak: number } {
    const days = Array.from(new Set(activeDayKeys)).sort(); // ascending YYYY-MM-DD
    if (days.length === 0) return { currentStreak: 0, longestStreak: 0 };

    const MS_PER_DAY = 86_400_000;
    const toMidnightMs = (key: string) => Date.parse(`${key}T00:00:00.000Z`);
    const dayCount = (key: string) => Math.round(toMidnightMs(key) / MS_PER_DAY);

    // ── longestStreak: longest run of consecutive day numbers ─────────────────
    let longestStreak = 1;
    let run = 1;
    for (let i = 1; i < days.length; i++) {
        if (dayCount(days[i]) - dayCount(days[i - 1]) === 1) {
            run += 1;
        } else {
            run = 1;
        }
        if (run > longestStreak) longestStreak = run;
    }

    // ── currentStreak: run ending today (or yesterday) ────────────────────────
    const todayNum = dayCount(todayKey);
    const lastNum = dayCount(days[days.length - 1]);
    const gapFromToday = todayNum - lastNum;

    let currentStreak = 0;
    // Only count a "current" streak if the latest active day is today or yesterday.
    if (gapFromToday === 0 || gapFromToday === 1) {
        currentStreak = 1;
        for (let i = days.length - 1; i > 0; i--) {
            if (dayCount(days[i]) - dayCount(days[i - 1]) === 1) {
                currentStreak += 1;
            } else {
                break;
            }
        }
    }

    return { currentStreak, longestStreak };
}

/**
 * True when an ISO `completedAt` timestamp falls inside the rolling
 * `windowDays`-day window ending at `nowMs`. This is the pure, DB-free mirror of
 * the Prisma `completedAt: { gte: cutoff }` filter applied in `getHeatmap`: it
 * bounds the heatmap/streak scan to a trailing window instead of every workout a
 * user has ever logged. `windowDays` defaults to the shared
 * {@link MAX_QUERY_RANGE_DAYS} (366) so the bound matches the other list/range
 * endpoints; 366 days fully contains any current/longest streak ending
 * today/yesterday, so real-data results are unchanged.
 *
 * Exported so the bound is unit-testable without a PrismaClient (`nowMs` is
 * injected, matching the `computeStreaks` style). The actual enforcement remains
 * the Prisma `gte`; this helper documents/validates the same cutoff math.
 */
export function isWithinHeatmapWindow(
    completedAtIso: string,
    nowMs: number,
    windowDays = MAX_QUERY_RANGE_DAYS,
): boolean {
    return Date.parse(completedAtIso) >= nowMs - windowDays * 86_400_000;
}

export interface CreateWorkoutInput {
    userId: string;
    type: string;
    title: string;
    duration: number;
    intensity: string;
    splitType?: string | null;
    muscleGroups?: string[];
    caloriesBurned?: number | null;
    notes?: string | null;
    scheduledAt?: string | null;
    completedAt?: string | null;
    exercises: {
        name: string;
        muscleGroup?: string;
        sets?: number | null;
        reps?: number | null;
        weightKg?: number | null;
        distanceKm?: number | null;
        durationSecs?: number | null;
        restSecs?: number | null;
        order?: number;
    }[];
}

export class ExerciseService {
    constructor(
        private readonly prisma: PrismaClient,
        private readonly eventBus: EventBus,
    ) { }

    async listWorkouts(userId: string, limit = 20): Promise<Workout[]> {
        try {
            return await this.prisma.workout.findMany({
                where: { userId },
                include: { exercises: { orderBy: { order: 'asc' } } },
                orderBy: { completedAt: 'desc' },
                take: limit,
            });
        } catch (err) {
            logger.error({ err, userId }, 'Failed to list workouts');
            throw err;
        }
    }

    async searchLibrary(
        filters: { query?: string, equipment?: string, muscleGroup?: string, bodyPart?: string, category?: string },
        limit = 50,
    ) {
        try {
            const { query, category, equipment, muscleGroup, bodyPart } = filters;

            // ── 1. Search the seeded LibraryExercise table first ──────────────
            const where: Record<string, unknown> = {};
            if (query) {
                where.name = { contains: query, mode: 'insensitive' };
            }
            if (muscleGroup) {
                where.muscleGroup = { contains: muscleGroup, mode: 'insensitive' };
            }
            if (bodyPart) {
                where.bodyPart = { contains: bodyPart, mode: 'insensitive' };
            }
            if (equipment) {
                where.equipment = { contains: equipment, mode: 'insensitive' };
            }
            if (category) {
                const c = category.toLowerCase();
                if (c === 'kegel') {
                    where.category = 'kegel';
                } else if (c === 'home') {
                    where.category = 'home';
                } else if (c === 'gym') {
                    where.category = 'gym';
                } else if (c === 'cardio') {
                    where.category = 'cardio';
                }
            }

            const dbResults = await this.prisma.libraryExercise.findMany({
                where: where as any,
                take: limit,
                orderBy: { name: 'asc' },
            });

            if (dbResults.length > 0) {
                return dbResults.map(ex => ({
                    id: ex.id,
                    name: ex.name,
                    muscleGroup: ex.muscleGroup,
                    equipment: ex.equipment ?? 'body weight',
                    difficulty: ex.difficulty ?? 'intermediate',
                    instructions: ex.instructions ?? undefined,
                    imageUrl: ex.imageUrl ?? undefined,
                    demoUrl: ex.demoUrl ?? resolveDemoUrl(ex.name) ?? undefined,
                    category: ex.category ?? undefined,
                    bodyPart: ex.bodyPart ?? undefined,
                }));
            }

            // ── 2. Fall back to wger live search ──────────────────────────────
            let exercises = await searchExercisesLive(query || '');

            if (category) {
                const c = category.toLowerCase();
                exercises = exercises.filter(ex => {
                    if (c === 'home') return HOME_EQUIPMENT.includes(ex.equipment.toLowerCase());
                    if (c === 'gym') return GYM_EQUIPMENT.includes(ex.equipment.toLowerCase());
                    if (c === 'cardio') return CARDIO_BODY_PARTS.includes(ex.bodyPart.toLowerCase()) || CARDIO_EQUIPMENT.includes(ex.equipment.toLowerCase());
                    if (c === 'kegel') return ex.bodyPart.toLowerCase().includes('pelvic');
                    return true;
                });
            }

            return exercises.slice(0, limit).map(ex => ({
                id: ex.id,
                name: ex.name,
                muscleGroup: ex.target || ex.bodyPart,
                equipment: ex.equipment,
                difficulty: 'intermediate',
                instructions: Array.isArray(ex.instructions) ? ex.instructions.join('\n') : ex.instructions,
                imageUrl: ex.gifUrl || undefined,
                demoUrl: resolveDemoUrl(ex.name) ?? undefined,
            }));
        } catch (err) {
            logger.error({ err, filters }, 'Failed to search exercise library');
            throw err;
        }
    }

    async getLibraryExerciseById(id: string) {
        // 1. Try the seeded DB first (UUIDs from searchLibrary arrive here)
        const dbEx = await this.prisma.libraryExercise.findUnique({ where: { id } });
        if (dbEx) {
            return {
                id: dbEx.id,
                name: dbEx.name,
                muscleGroup: dbEx.muscleGroup,
                equipment: dbEx.equipment ?? 'body weight',
                difficulty: dbEx.difficulty ?? 'intermediate',
                instructions: dbEx.instructions ?? undefined,
                imageUrl: dbEx.imageUrl ?? undefined,
                demoUrl: dbEx.demoUrl ?? resolveDemoUrl(dbEx.name) ?? undefined,
                bodyPart: dbEx.bodyPart ?? undefined,
                category: dbEx.category ?? undefined,
            };
        }

        // 2. Fall back to wger live fetch (for legacy wger-{n} IDs)
        const ex = await fetchExerciseById(id);
        if (!ex) return null;
        return {
            id: ex.id,
            name: ex.name,
            muscleGroup: ex.target || ex.bodyPart,
            equipment: ex.equipment,
            difficulty: 'intermediate',
            instructions: Array.isArray(ex.instructions)
                ? ex.instructions.join('\n')
                : (ex.instructions as string | undefined),
            imageUrl: ex.gifUrl || undefined,
            demoUrl: resolveDemoUrl(ex.name) ?? undefined,
            bodyPart: ex.bodyPart,
            category: undefined as string | undefined,
        };
    }

    async getWorkout(id: string, userId: string): Promise<Workout | null> {
        try {
            return await this.prisma.workout.findFirst({
                where: { id, userId },
                include: { exercises: { orderBy: { order: 'asc' } } },
            });
        } catch (err) {
            logger.error({ err, id, userId }, 'Failed to get workout');
            throw err;
        }
    }

    async createWorkout(input: CreateWorkoutInput): Promise<Workout> {
        try {
            const { exercises, userId, scheduledAt, completedAt, ...rest } = input;

            const totalVolume = exercises.reduce((sum, e) => {
                const vol = (e.sets || 1) * (e.reps || 1) * (e.weightKg || 0);
                return sum + vol;
            }, 0);

            const workout = await this.prisma.workout.create({
                data: {
                    ...rest,
                    userId,
                    // @ts-ignore
                    muscleGroups: rest.muscleGroups ?? [],
                    totalVolume,
                    scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
                    completedAt: completedAt ? new Date(completedAt) : new Date(),
                    exercises: {
                        create: exercises.map((e, idx) => ({
                            name: e.name,
                            muscleGroup: e.muscleGroup ?? 'FULL_BODY',
                            sets: e.sets ?? null,
                            reps: e.reps ?? null,
                            weightKg: e.weightKg ?? null,
                            distanceKm: e.distanceKm ?? null,
                            durationSecs: e.durationSecs ?? null,
                            restSecs: e.restSecs ?? null,
                            order: e.order ?? idx,
                        })),
                    },
                },
                include: { exercises: { orderBy: { order: 'asc' } } },
            });

            logger.info({ workoutId: workout.id, userId }, 'Workout logged');

            // Publish exercise.workout-logged for progress-service & notification-service
            const payload: ExerciseLoggedPayload = {
                workoutId: workout.id,
                type: workout.type,
                title: workout.title,
                durationMins: workout.duration,
                intensity: workout.intensity,
                // @ts-ignore
                splitType: (workout as any).splitType ?? null,
                // @ts-ignore
                caloriesBurned: (workout as any).caloriesBurned ?? null,
                completedAt: (workout.completedAt || new Date()).toISOString(),
            };

            await this.eventBus.publish<ExerciseLoggedPayload>(Channels.Exercise.WorkoutLogged, {
                eventId: crypto.randomUUID(),
                eventType: 'exercise.workout-logged',
                producedAt: new Date().toISOString(),
                producerService: 'exercise-service',
                correlationId: crypto.randomUUID(),
                userId,
                payload,
            });

            return workout;
        } catch (err) {
            logger.error({ err, userId: input.userId }, 'Failed to create workout');
            throw err;
        }
    }

    async deleteWorkout(id: string, userId: string): Promise<boolean> {
        try {
            const result = await this.prisma.workout.deleteMany({ where: { id, userId } });
            if (result.count === 0) return false;

            await this.eventBus.publish(Channels.Exercise.WorkoutDeleted, {
                eventId: crypto.randomUUID(),
                eventType: 'exercise.workout-deleted',
                producedAt: new Date().toISOString(),
                producerService: 'exercise-service',
                correlationId: crypto.randomUUID(),
                userId,
                payload: { workoutId: id },
            });

            logger.info({ workoutId: id, userId }, 'Workout deleted');
            return true;
        } catch (err) {
            logger.error({ err, workoutId: id, userId }, 'Failed to delete workout');
            throw err;
        }
    }

    // ── Analytics & Heatmap ───────────────────────────────────────────────────

    async getHeatmap(userId: string) {
        // Bound the scan server-side to a rolling MAX_QUERY_RANGE_DAYS (366-day)
        // trailing window instead of scanning every workout the user has ever
        // logged (the same unbounded-DB-scan class fixed for shift/plan ranges).
        // A 366-day window fully contains any current/longest streak ending
        // today/yesterday — see `isWithinHeatmapWindow` for the pure mirror of
        // this cutoff — so the returned shape is unchanged for real data.
        const cutoffMs = Date.now() - MAX_QUERY_RANGE_DAYS * 86_400_000;
        const cutoff = new Date(cutoffMs);
        const workouts = await this.prisma.workout.findMany({
            where: { userId, completedAt: { gte: cutoff } },
            select: { completedAt: true, intensity: true, type: true, duration: true }
        });

        // Group by YYYY-MM-DD
        const map = new Map<string, number>();
        for (const w of workouts) {
            const d = w.completedAt.toISOString().split('T')[0];
            const currentCount = map.get(d) || 0;
            // Weigh intensity differently for heatmap intensity (1-4 level)
            const pts = w.intensity === 'MAX' ? 3 : w.intensity === 'HIGH' ? 2 : 1;
            map.set(d, currentCount + pts);
        }

        const data = Array.from(map.entries()).map(([date, count]) => {
            return {
                date: new Date(date).getTime(),
                count: Math.min(count, 4) // cap at 4 for standard git-style coloring
            };
        });

        // Derive real streaks from the same set of active YYYY-MM-DD day-keys.
        // `todayKey` uses the same UTC ISO-date basis as the keys above so the
        // "ending today/yesterday" comparison is consistent.
        const todayKey = new Date().toISOString().split('T')[0];
        const { currentStreak, longestStreak } = computeStreaks(map.keys(), todayKey);

        // Return activeDays logic for UI
        return {
            activeDays: data.filter(d => d.count > 0).length,
            currentStreak,
            longestStreak,
            heatmapData: data.sort((a, b) => a.date - b.date)
        };
    }

    async getExerciseAnalytics(userId: string, exerciseName: string) {
        const exercises = await this.prisma.exercise.findMany({
            where: { workout: { userId }, name: { equals: exerciseName, mode: 'insensitive' } },
            include: { workout: { select: { completedAt: true } } },
            orderBy: { workout: { completedAt: 'asc' } }
        });

        return exercises.map(ex => {
            const vol = (ex.sets || 1) * (ex.reps || 1) * (ex.weightKg || 0);
            return {
                id: ex.id,
                date: ex.workout.completedAt,
                maxWeight: ex.weightKg || 0,
                volume: vol,
                reps: ex.reps,
                sets: ex.sets
            };
        });
    }

    // ── Routines ──────────────────────────────────────────────────────────────

    async getRoutines(userId: string) {
        return this.prisma.workoutRoutine.findMany({
            where: {
                OR: [
                    { userId },
                    { userId: null } // Global templates
                ]
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    async createRoutine(userId: string, data: any, aiGenerated = false) {
        // Explicit whitelist: never blind-spread client `data` into Prisma. Only
        // these named columns of WorkoutRoutine are accepted; anything else the
        // client sends (e.g. id, userId override, createdAt) is dropped.
        // `aiGenerated` is set ONLY from the trusted caller (the AI generate route
        // passes true; the manual create route leaves the default false) — never
        // from client `data` — so a manual routine never burns the daily AI quota.
        const { title, description, splitType, muscleGroups, exercises } = data ?? {};
        return this.prisma.workoutRoutine.create({
            data: {
                title,
                description: description ?? null,
                splitType: splitType ?? null,
                muscleGroups: muscleGroups ?? [],
                userId,
                aiGenerated,
                // Ensure exercises is a proper JSON array
                exercises: exercises ?? []
            }
        });
    }

    // ── 1RM Logs ──────────────────────────────────────────────────────────────

    async getOneRepMaxes(userId: string) {
        return this.prisma.oneRepMaxLog.findMany({
            where: { userId },
            orderBy: { date: 'desc' },
            take: 50
        });
    }

    async logOneRepMax(userId: string, data: { exerciseName: string, weightKg: number, estimated1RMKg: number }) {
        return this.prisma.oneRepMaxLog.create({
            data: {
                userId,
                exerciseName: data.exerciseName,
                weightKg: data.weightKg,
                estimated1RMKg: data.estimated1RMKg,
                date: new Date()
            }
        });
    }

    // ── Workout Sessions ──────────────────────────────────────────────────────

    async startSession(userId: string, routineId?: string) {
        // Single-active-session invariant: a user may have at most ONE 'active'
        // workout session at a time. Before creating the new one, atomically
        // cancel any session the user has left active (e.g. abandoned without
        // calling /end) so we never accumulate unbounded concurrent ACTIVE rows.
        // The updateMany is scoped to the caller's own active sessions, mirroring
        // the { userId, status } scoping used by the other session methods.
        await this.prisma.workoutSession.updateMany({
            where: { userId, status: 'active' },
            data: { status: 'cancelled', endedAt: new Date() }
        });
        return this.prisma.workoutSession.create({
            data: {
                userId,
                routineId,
                status: 'active'
            }
        });
    }

    async getActiveSession(userId: string) {
        // orderBy startedAt:desc so that — even if a stale 'active' row ever
        // slipped through (e.g. a legacy row created before the single-active
        // invariant was enforced) — we surface the MOST RECENT active session.
        return this.prisma.workoutSession.findFirst({
            where: { userId, status: 'active' },
            orderBy: { startedAt: 'desc' },
            include: { logs: true }
        });
    }

    async logSessionExercise(sessionId: string, userId: string, exerciseName: string, sets: number, reps: number, weightKg: number, durationSecs: number) {
        // IDOR + state guard: only allow logging into a session that belongs to
        // the caller AND is still 'active'. Mirrors the getWorkout/deleteWorkout
        // `{ id, userId }` filter, additionally scoped to status:'active' so a set
        // cannot be appended to a completed/cancelled (terminal) session. Returns
        // null when the session doesn't exist, isn't the caller's, or is no longer
        // active — the route answers 404 without mutating the session.
        const session = await this.prisma.workoutSession.findFirst({
            where: { id: sessionId, userId, status: 'active' },
            select: { id: true },
        });
        if (!session) return null;

        return this.prisma.exerciseLog.create({
            data: {
                sessionId,
                exerciseName,
                sets,
                reps,
                weightKg,
                durationSecs
            }
        });
    }

    async endSession(sessionId: string, userId: string) {
        // IDOR + state guard: scope the mutation to the caller's own session that
        // is still 'active' via updateMany({ id, userId, status:'active' }) — count
        // 0 means it doesn't exist, isn't theirs, OR is already terminal
        // (completed/cancelled), so we return null and let the route answer 404.
        // The status:'active' filter makes end idempotent-safe: a second /end on an
        // already-ended session no longer re-completes it (overwriting endedAt).
        // Mirrors the deleteWorkout deleteMany({ id, userId }) pattern.
        const result = await this.prisma.workoutSession.updateMany({
            where: { id: sessionId, userId, status: 'active' },
            data: { status: 'completed', endedAt: new Date() }
        });
        if (result.count === 0) return null;

        // Return the updated row in the same shape the original .update() did
        // (no relations) so the owner's success response is unchanged.
        return this.prisma.workoutSession.findFirst({
            where: { id: sessionId, userId },
        });
    }

    // ── GDPR purge ──────────────────────────────────────────────────────────────
    // PERMANENTLY delete EVERY exercise-service row owned by `userId` for a
    // right-to-erasure request. Covers all four user-owned tables in this
    // service's schema (every model carrying a user_id column):
    //   • workouts          — keyed by user_id.
    //   • workout_routines  — keyed by user_id (a NULL user_id row is a GLOBAL
    //                         template owned by NO user, so `where: { userId }`
    //                         with a concrete id never touches it).
    //   • 1rm_logs          — keyed by user_id.
    //   • workout_sessions  — keyed by user_id.
    //
    // The two relation-keyed child tables carry NO user_id and are erased
    // transitively by their parent's DB-level cascade (declared in schema.prisma):
    //   • exercises     — onDelete: Cascade from workouts        (deleted with the workout).
    //   • exercise_logs — onDelete: Cascade from workout_sessions (deleted with the session).
    // So deleting only the parent rows above removes the children too; they are
    // not counted in the summary because they belong to the user only through the
    // parent (no per-user ownership column of their own).
    //
    // IDEMPOTENT by construction: every step is a deleteMany, which returns
    // `{ count: 0 }` (never throws) when no rows match — so purging a user with
    // no data, or purging the same user twice, both succeed. Returns a per-table
    // deletedCounts summary the caller surfaces in the 200 body.
    //
    // All deletes run inside `$transaction` so the purge is all-or-nothing: a
    // mid-purge failure leaves no partially-erased user.
    async purgeUser(userId: string): Promise<{
        workouts: number;
        workout_routines: number;
        '1rm_logs': number;
        workout_sessions: number;
    }> {
        const [workouts, workoutRoutines, oneRepMaxLogs, workoutSessions] =
            await this.prisma.$transaction([
                // Cascades to child `exercises` rows (exercises.onDelete: Cascade).
                this.prisma.workout.deleteMany({ where: { userId } }),
                // A concrete userId never matches the NULL-user global templates.
                this.prisma.workoutRoutine.deleteMany({ where: { userId } }),
                this.prisma.oneRepMaxLog.deleteMany({ where: { userId } }),
                // Cascades to child `exercise_logs` rows (exerciseLog.onDelete: Cascade).
                this.prisma.workoutSession.deleteMany({ where: { userId } }),
            ]);

        return {
            workouts: workouts.count,
            workout_routines: workoutRoutines.count,
            '1rm_logs': oneRepMaxLogs.count,
            workout_sessions: workoutSessions.count,
        };
    }

    // ── GDPR export (right-to-access) ─────────────────────────────────────────────
    // Read-only counterpart of purgeUser: RETURNS every exercise-service row owned
    // by `userId`, keyed by table name, so right-to-access and right-to-erasure
    // cover IDENTICAL data and stay in sync. Mirrors the purge's table set EXACTLY:
    //   • workouts          — keyed by user_id. The cascade-child `exercises` rows
    //                         are nested under each workout via `include` so they
    //                         are exported too (the purge erases them via cascade).
    //   • workout_routines  — keyed by user_id. A NULL user_id row is a GLOBAL
    //                         template owned by NO user, so `where: { userId }` with
    //                         a concrete id never returns it (matches the purge).
    //   • 1rm_logs          — keyed by user_id.
    //   • workout_sessions  — keyed by user_id. The cascade-child `exercise_logs`
    //                         rows are nested under each session via `include` so
    //                         they are exported too (the purge erases them via cascade).
    //
    // SECURITY: this service holds NO secret/credential/token/password/raw-key
    // column on any of these tables — every exported column is user-entered fitness
    // data (workout/exercise names, sets/reps/weights, routine JSON, timestamps).
    // So the full rows are returned verbatim. (If a secret/token/password column is
    // ever added to any of these tables, it MUST be stripped here before returning.)
    //
    // READ-ONLY & IDEMPOTENT: only findMany runs; calling it twice yields identical
    // output and never mutates state. BOUNDED: each top-level table is capped at
    // EXPORT_ROW_LIMIT rows (newest first) so a pathological user cannot force an
    // unbounded payload; `_meta` flags whether any table was truncated at the cap.
    async exportUser(userId: string): Promise<{
        workouts: any[];
        workout_routines: any[];
        '1rm_logs': any[];
        workout_sessions: any[];
        _meta: {
            workoutsTruncated: boolean;
            workoutRoutinesTruncated: boolean;
            oneRepMaxLogsTruncated: boolean;
            workoutSessionsTruncated: boolean;
            rowLimit: number;
        };
    }> {
        const cap = EXPORT_ROW_LIMIT;
        const [workouts, workoutRoutines, oneRepMaxLogs, workoutSessions] =
            await Promise.all([
                // include child `exercises` — the rows the purge erases via cascade.
                this.prisma.workout.findMany({
                    where: { userId },
                    include: { exercises: { orderBy: { order: 'asc' } } },
                    orderBy: { completedAt: 'desc' },
                    take: cap + 1,
                }),
                // A concrete userId never matches the NULL-user global templates.
                this.prisma.workoutRoutine.findMany({
                    where: { userId },
                    orderBy: { createdAt: 'desc' },
                    take: cap + 1,
                }),
                this.prisma.oneRepMaxLog.findMany({
                    where: { userId },
                    orderBy: { date: 'desc' },
                    take: cap + 1,
                }),
                // include child `exercise_logs` — the rows the purge erases via cascade.
                this.prisma.workoutSession.findMany({
                    where: { userId },
                    include: { logs: true },
                    orderBy: { startedAt: 'desc' },
                    take: cap + 1,
                }),
            ]);

        const workoutsTruncated = workouts.length > cap;
        const workoutRoutinesTruncated = workoutRoutines.length > cap;
        const oneRepMaxLogsTruncated = oneRepMaxLogs.length > cap;
        const workoutSessionsTruncated = workoutSessions.length > cap;

        return {
            workouts: workoutsTruncated ? workouts.slice(0, cap) : workouts,
            workout_routines: workoutRoutinesTruncated ? workoutRoutines.slice(0, cap) : workoutRoutines,
            '1rm_logs': oneRepMaxLogsTruncated ? oneRepMaxLogs.slice(0, cap) : oneRepMaxLogs,
            workout_sessions: workoutSessionsTruncated ? workoutSessions.slice(0, cap) : workoutSessions,
            _meta: {
                workoutsTruncated,
                workoutRoutinesTruncated,
                oneRepMaxLogsTruncated,
                workoutSessionsTruncated,
                rowLimit: cap,
            },
        };
    }
}

// Per-table row cap for the GDPR export. Generous enough that a real user's full
// history is returned, but bounds the payload so a pathological user cannot force
// an unbounded read. `take: cap + 1` lets exportUser detect (and flag) truncation.
const EXPORT_ROW_LIMIT = 50_000;
