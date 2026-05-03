import { PrismaClient, Workout } from './generated/prisma';
import { EventBus } from '@nightfuel/events';
import { Channels, ExerciseLoggedPayload } from '@nightfuel/types';
import { createLogger } from '@nightfuel/config';
import {
    searchExercisesLive,
    fetchExerciseById,
    HOME_EQUIPMENT,
    GYM_EQUIPMENT,
    CARDIO_BODY_PARTS,
    CARDIO_EQUIPMENT,
} from './exercisedb';

const logger = createLogger('exercise-service');

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

    async searchLibrary(filters: { query?: string, equipment?: string, muscleGroup?: string, category?: string }, limit = 50) {
        try {
            const { query, category, equipment, muscleGroup } = filters;

            // ── 1. Search the seeded LibraryExercise table first ──────────────
            const where: Record<string, unknown> = {};
            if (query) {
                where.name = { contains: query, mode: 'insensitive' };
            }
            if (muscleGroup) {
                where.muscleGroup = { contains: muscleGroup, mode: 'insensitive' };
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
        const workouts = await this.prisma.workout.findMany({
            where: { userId },
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

        // Return activeDays logic for UI
        return {
            activeDays: data.filter(d => d.count > 0).length,
            currentStreak: 0, // Simplified for now
            longestStreak: 0,
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

    async createRoutine(userId: string, data: any) {
        return this.prisma.workoutRoutine.create({
            data: {
                ...data,
                userId,
                // Ensure exercises is proper JSON array
                exercises: data.exercises || []
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
        return this.prisma.workoutSession.create({
            data: {
                userId,
                routineId,
                status: 'active'
            }
        });
    }

    async getActiveSession(userId: string) {
        return this.prisma.workoutSession.findFirst({
            where: { userId, status: 'active' },
            include: { logs: true }
        });
    }

    async logSessionExercise(sessionId: string, exerciseName: string, sets: number, reps: number, weightKg: number, durationSecs: number) {
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

    async endSession(sessionId: string) {
        return this.prisma.workoutSession.update({
            where: { id: sessionId },
            data: { status: 'completed', endedAt: new Date() }
        });
    }
}
