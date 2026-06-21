import { PrismaClient, UserProfile, UserPreferences } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { Channels, UserStatusUpdatedPayload } from '@nightfuel/types';
import { randomUUID } from 'crypto';
import { createLogger } from '@nightfuel/config';
import fs from 'fs';
import path from 'path';
import { UpdateProfileBody, UpdatePreferencesBody, UpdateOnboardingBody, UpdatePrivacyBody } from './schemas';
import { calculateBMI, calculateBMR, calculateTDEE, calculateAge } from './utils/calculators';

const logger = createLogger('user-service:service');

export interface ProfileWithPreferences extends UserProfile {
    preferences: UserPreferences | null;
    // Account-visibility flag. Declared here so the service/route layer compiles
    // against the new column before `prisma generate` regenerates the client from
    // the schema (the migration + schema.prisma own the runtime column). Once the
    // client is regenerated this is simply redundant with the generated field.
    isPrivate: boolean;
}

// Roles that get a CoachProfile stub automatically
const PROFESSIONAL_ROLES = new Set(['COACH', 'TRAINER', 'NUTRITIONIST', 'DIETITIAN']);

export interface CreateProfileInput {
    userId: string;
    displayName: string;
    email?: string;
    timezone?: string;
    role?: string;
    region?: string;
}

export class UserService {
    constructor(
        private readonly prisma: PrismaClient,
        private readonly eventBus: RedisEventBus
    ) { }

    /**
     * Idempotently create a UserProfile + UserPreferences record.
     * Called when the `nightfuel:auth:user-registered` event is received.
     * For COACH/TRAINER/NUTRITIONIST roles, also seeds a CoachProfile stub.
     */
    async createProfileFromRegistration(input: CreateProfileInput): Promise<void> {
        const { userId, displayName, timezone, role } = input;
        logger.info({ userId, role }, 'Creating user profile from registration event');

        await this.prisma.userProfile.upsert({
            where: { userId },
            create: {
                userId,
                displayName,
                timezone: timezone ?? 'UTC',
                region: input.region ?? 'us',
                onboardingCompleted: false,
                onboardingStep: 0,
            },
            update: {}, // Idempotent: preserve any existing data
        });

        await this.prisma.userPreferences.upsert({
            where: { userId },
            create: {
                userId,
                primaryGoal: 'GENERAL_HEALTH',
                dietaryPreference: 'NONE',
                activityLevel: 'MODERATELY_ACTIVE',
                allergies: [],
            },
            update: {}, // Idempotent
        });

        // Seed a CoachProfile stub for professional roles so the coach dashboard
        // is immediately accessible without an extra setup step
        if (role && PROFESSIONAL_ROLES.has(role)) {
            await (this.prisma as any).coachProfile.upsert({
                where: { userId },
                create: {
                    userId,
                    specializations: [],
                    certifications: [],
                    isAvailable: false, // Will be toggled on after profile setup
                },
                update: {},
            });
            logger.info({ userId, role }, 'CoachProfile stub created');
        }

        logger.info({ userId }, 'User profile provisioning complete');
    }

    /**
     * Internal helper to robustly ensure a user profile + preferences exist
     * if queried but missing (due to event processing failures/lag).
     */
    private async ensureProfileExists(userId: string): Promise<void> {
        const count = await this.prisma.userProfile.count({ where: { userId } });
        if (count > 0) return;

        try {
            logger.warn({ userId }, 'Profile missing on query. Auto-provisioning defaults.');
            await this.createProfileFromRegistration({
                userId,
                displayName: "NightFuel User",
                timezone: "UTC",
                region: "us"
            });
        } catch (err) {
            logger.error({ userId, err }, 'Auto-provisioning failed.');
        }
    }

    /**
     * Fetch a user's full profile including their preferences.
     * Auto-provisions defaults if missing.
     */
    async getProfileWithPreferences(userId: string): Promise<ProfileWithPreferences | null> {
        await this.ensureProfileExists(userId);

        const profile = await this.prisma.userProfile.findUnique({
            where: { userId },
            include: { preferences: true, status: true },
        });

        if (!profile) {
            logger.warn({ userId }, 'Profile not found even after ensureProfileExists check.');
            return null;
        }

        // Cast via unknown: the runtime row carries isPrivate (schema + migration
        // own the column), but the checked-in generated client predates it, so a
        // direct cast doesn't statically overlap until `prisma generate` re-runs.
        return profile as unknown as ProfileWithPreferences;
    }

    async getStatus(userId: string) {
        return this.prisma.userStatus.findUnique({
            where: { userId }
        });
    }

    /**
     * Partially update a user's profile. All fields are optional.
     * dateOfBirth is accepted as an ISO date string (YYYY-MM-DD) and stored as DateTime.
     */
    async updateProfile(userId: string, body: UpdateProfileBody): Promise<UserProfile> {
        const data: Record<string, unknown> = {};

        if (body.displayName !== undefined) data.displayName = body.displayName;
        if (body.avatarUrl !== undefined) data.avatarUrl = body.avatarUrl;
        if (body.heightCm !== undefined) data.heightCm = body.heightCm;
        if (body.weightKg !== undefined) data.weightKg = body.weightKg;
        if (body.biologicalSex !== undefined) data.biologicalSex = body.biologicalSex;
        if (body.timezone !== undefined) data.timezone = body.timezone;
        if (body.region !== undefined) data.region = body.region;
        if (body.dateOfBirth !== undefined) {
            const dob = body.dateOfBirth;
            // @ts-ignore
            data.dateOfBirth = dob ? new Date(dob) : null;
        }

        // Upsert: auto-create the profile if the user-registered Redis event
        // hasn't been processed yet (race condition: user can reach onboarding
        // "Finish & Sync" before the async event round-trip completes).
        try {
            const profile = await this.prisma.userProfile.upsert({
                where: { userId },
                create: {
                    userId,
                    displayName: (body.displayName as string) ?? 'User',
                    timezone: (body.timezone as string) ?? 'UTC',
                    onboardingCompleted: false,
                    onboardingStep: 0,
                    ...data,
                },
                update: data,
            }).catch(err => {
                // Dev-only debug file dump — never write to disk in production
                // (cwd may be read-only in the container, and the error data
                // contains PII). The structured logger.error below is the
                // production diagnostic.
                if (process.env.NODE_ENV !== 'production') {
                    const errorLog = {
                        timestamp: new Date().toISOString(),
                        userId,
                        err,
                        data
                    };
                    fs.appendFileSync(
                        path.join(process.cwd(), 'prisma-error.log'),
                        JSON.stringify(errorLog, null, 2) + '\n---\n'
                    );
                }
                logger.error({ userId, err, data }, 'Prisma error');
                throw err;
            });

            logger.info({ userId }, 'User profile updated');

            // Auto-recalculate baseline metrics
            await this.recalculateBaselines(userId);

            return profile;
        } catch (err: any) {
            logger.error({ userId, err, data }, 'Failed to upsert user profile');
            throw err;
        }
    }

    /**
     * Update only the account-visibility flag (public/private profile).
     * Backs PATCH /v1/users/me — the social public/private contract that
     * community-service & chat-service compose against.
     *
     * Race-safe mirror of updateProfile: only assigns isPrivate when the body
     * actually carries it (a PATCH may omit it), then writes via a plain
     * `update`. If the profile row doesn't exist yet (Prisma P2025 — same
     * registration-event lag window updateProfile guards), we surface the
     * canonical 'Profile not found' string so the route maps it to the fixed
     * 404 literal. getProfileWithPreferences selects the full row (incl.
     * isPrivate), so callers see the persisted value.
     */
    async updatePrivacy(userId: string, body: UpdatePrivacyBody): Promise<UserProfile> {
        const data: Record<string, unknown> = {};
        if (body.isPrivate !== undefined) data.isPrivate = body.isPrivate;

        try {
            const profile = await this.prisma.userProfile.update({
                where: { userId },
                data,
            });

            logger.info({ userId }, 'User privacy updated');
            return profile;
        } catch (err: any) {
            // P2025 = "Record to update not found" — translate to the canonical
            // generic so the route emits its fixed 'Profile not found' literal
            // (never echo err.message verbatim — see error-redaction suite).
            if (err?.code === 'P2025') {
                logger.warn({ userId }, 'Privacy update on missing profile');
                throw new Error('Profile not found');
            }
            logger.error({ userId, err }, 'Failed to update user privacy');
            throw err;
        }
    }

    /**
     * Fetch only the preferences record for a user.
     * Auto-provisions defaults if missing.
     */
    async getPreferences(userId: string): Promise<any | null> {
        await this.ensureProfileExists(userId);

        const prefs = await this.prisma.userPreferences.findUnique({
            where: { userId },
            include: { profile: { select: { region: true } } }
        });

        if (!prefs) {
            logger.warn({ userId }, 'Preferences not found even after ensureProfileExists check.');
            return null;
        }

        const { profile, ...rest } = prefs as any;
        return {
            ...rest,
            region: profile?.region ?? 'us'
        };
    }

    /**
     * Partially update a user's nutritional preferences.
     * Uses upsert so preferences can be created even if the normal event flow failed.
     */
    async updatePreferences(userId: string, body: UpdatePreferencesBody): Promise<UserPreferences> {
        try {
            const data: Record<string, unknown> = {};

            if (body.primaryGoal !== undefined) data.primaryGoal = body.primaryGoal;
            if (body.dietaryPreference !== undefined) data.dietaryPreference = body.dietaryPreference;
            if (body.targetCalories !== undefined) data.targetCalories = body.targetCalories;
            if (body.targetProteinG !== undefined) data.targetProteinG = body.targetProteinG;
            if (body.targetCarbsG !== undefined) data.targetCarbsG = body.targetCarbsG;
            if (body.targetFatG !== undefined) data.targetFatG = body.targetFatG;
            if (body.activityLevel !== undefined) data.activityLevel = body.activityLevel;
            if (body.experienceLevel !== undefined) data.experienceLevel = body.experienceLevel;
            if (body.lifestyleType !== undefined) data.lifestyleType = body.lifestyleType;
            if (body.sleepWindowStart !== undefined) data.sleepWindowStart = body.sleepWindowStart;
            if (body.sleepWindowEnd !== undefined) data.sleepWindowEnd = body.sleepWindowEnd;
            if (body.allergies !== undefined) data.allergies = body.allergies;
            if (body.dietMode !== undefined) data.dietMode = body.dietMode;
            if (body.isInjurySafeMode !== undefined) data.isInjurySafeMode = body.isInjurySafeMode;
            if (body.workoutEnvironment !== undefined) data.workoutEnvironment = body.workoutEnvironment;
            if (body.availableEquipment !== undefined) data.availableEquipment = body.availableEquipment;
            if (body.workoutDurationPreference !== undefined) data.workoutDurationPreference = body.workoutDurationPreference;
            if (body.splitPreference !== undefined) data.splitPreference = body.splitPreference;
            if (body.isBodybuilderMode !== undefined) data.isBodybuilderMode = body.isBodybuilderMode;

            const prefs = await this.prisma.userPreferences.upsert({
                where: { userId },
                create: {
                    userId,
                    primaryGoal: (body.primaryGoal as string) ?? 'GENERAL_HEALTH',
                    dietaryPreference: (body.dietaryPreference as string) ?? 'NONE',
                    activityLevel: (body.activityLevel as string) ?? 'MODERATELY_ACTIVE',
                    experienceLevel: (body.experienceLevel as string) ?? 'BEGINNER',
                    lifestyleType: (body.lifestyleType as string) ?? 'OFFICE_WORKER',
                    sleepWindowStart: body.sleepWindowStart ?? null,
                    sleepWindowEnd: body.sleepWindowEnd ?? null,
                    allergies: body.allergies ?? [],
                    ...data,
                },
                update: data,
            });

            logger.info({ userId }, 'User preferences updated');

            // Auto-recalculate baseline metrics
            await this.recalculateBaselines(userId);

            return prefs;
        } catch (err: any) {
            logger.error({ userId, err, body }, 'Failed to update user preferences');
            throw err;
        }
    }

    /**
     * Advance or complete a user's onboarding flow.
     */
    async updateOnboarding(userId: string, body: UpdateOnboardingBody): Promise<UserProfile> {
        // Upsert: same race-condition guard as updateProfile — the profile may
        // not exist yet if the Redis event hasn't been consumed.
        const profile = await this.prisma.userProfile.upsert({
            where: { userId },
            create: {
                userId,
                displayName: 'User',
                timezone: 'UTC',
                onboardingStep: body.step,
                onboardingCompleted: body.completed,
            },
            update: {
                onboardingStep: body.step,
                onboardingCompleted: body.completed,
            },
        }).catch(err => {
            // Dev-only debug file dump — never write to disk in production
            // (cwd may be read-only in the container). The structured
            // logger.error is the production diagnostic.
            if (process.env.NODE_ENV !== 'production') {
                const errorLog = {
                    method: 'updateOnboarding',
                    timestamp: new Date().toISOString(),
                    userId,
                    err,
                    // No 'data' object to log here, as updateOnboarding directly uses body.step/completed
                };
                fs.appendFileSync(path.join(process.cwd(), 'prisma-error.log'), JSON.stringify(errorLog, null, 2) + '\n---\n');
            }
            logger.error({ userId, err }, 'Prisma error');
            throw err;
        });

        if (body.completed) {
            const event = {
                eventId: randomUUID(),
                eventType: 'user.onboarding-completed',
                producedAt: new Date().toISOString(),
                producerService: 'user-service',
                correlationId: randomUUID(),
                userId,
                payload: {
                    onboardingStep: body.step,
                    completedAt: new Date().toISOString(),
                },
            };

            // Dev-only audit trail of outbound events — the real publish below
            // is the source of truth; never write to disk in production.
            if (process.env.NODE_ENV !== 'production') {
                fs.appendFileSync(
                    path.join(process.cwd(), 'event-out.log'),
                    `[${new Date().toISOString()}] Publishing to ${Channels.User.OnboardingCompleted} for user ${userId}\n`
                );
            }

            await this.eventBus.publish(Channels.User.OnboardingCompleted, event);
        }

        logger.info({ userId, step: body.step, completed: body.completed }, 'Onboarding state updated');
        return profile;
    }

    /**
     * Internal helper to calculate and sync health metrics
     */
    private async recalculateBaselines(userId: string): Promise<void> {
        try {
            const profile = await this.prisma.userProfile.findUnique({
                where: { userId },
                include: { preferences: true }
            });

            if (!profile || !profile.preferences) return;

            const { heightCm, weightKg, biologicalSex, dateOfBirth } = profile;
            const { activityLevel, primaryGoal } = profile.preferences;

            // 1. Calculate BMI
            if (heightCm && weightKg) {
                const bmi = calculateBMI(weightKg, heightCm);
                logger.debug({ userId, bmi }, 'Recalculated BMI');
                // Note: We could store BMI in DB if we added a field, but for now we calculate on the fly or just use it for TDEE
            }

            // 2. Calculate BMR & TDEE
            if (heightCm && weightKg && biologicalSex && dateOfBirth) {
                const age = calculateAge(new Date(dateOfBirth));
                const bmr = calculateBMR(weightKg, heightCm, age, biologicalSex);
                const tdee = calculateTDEE(bmr, activityLevel);

                logger.info({ userId, bmr, tdee }, 'Recalculated BMR and TDEE');

                // 3. Auto-adjust calories based on goal if not manually overridden
                // (In this case, we'll update targetCalories if it's currently null or we want to suggest it)
                let targetCalories = tdee;
                if (primaryGoal === 'WEIGHT_LOSS') targetCalories -= 500;
                if (primaryGoal === 'MUSCLE_GAIN') targetCalories += 300;

                // Simple macro split (40/30/30) as default
                const targetProteinG = (targetCalories * 0.3) / 4;
                const targetCarbsG = (targetCalories * 0.4) / 4;
                const targetFatG = (targetCalories * 0.3) / 9;

                await this.prisma.userPreferences.update({
                    where: { userId },
                    data: {
                        targetCalories: Math.round(targetCalories),
                        targetProteinG: Math.round(targetProteinG),
                        targetCarbsG: Math.round(targetCarbsG),
                        targetFatG: Math.round(targetFatG)
                    }
                });

                logger.info({ userId, targetCalories }, 'Auto-adjusted caloric targets based on baseline');
            }
        } catch (err) {
            logger.error({ userId, err }, 'Failed to recalculate baselines');
        }
    }

    /**
     * Update the materialized UserStatus (Digital Twin).
     */
    async updateUserStatus(userId: string, data: {
        fatigueScore?: number;
        circadianPeakTime?: string | null;
        circadianLowTime?: string | null;
        adherenceRate?: number;
        currentStreak?: number;
        currentTdee?: number;
        weightTrend?: string;
        lastUpdatedBy: string;
    }): Promise<void> {
        try {
            const status = await this.prisma.userStatus.upsert({
                where: { userId },
                create: {
                    userId,
                    ...data,
                },
                update: data,
            });

            await this.eventBus.publish<UserStatusUpdatedPayload>(Channels.User.StatusUpdated, {
                eventId: randomUUID(),
                eventType: 'user.status-updated',
                producedAt: new Date().toISOString(),
                producerService: 'user-service',
                correlationId: randomUUID(),
                userId,
                payload: {
                    fatigueScore: status.fatigueScore,
                    adherenceRate: status.adherenceRate,
                    currentStreak: status.currentStreak,
                    circadianPeakTime: status.circadianPeakTime,
                    circadianLowTime: status.circadianLowTime,
                    lastUpdatedBy: data.lastUpdatedBy
                }
            });

            logger.debug({ userId, updateSource: data.lastUpdatedBy }, 'UserStatus digital twin updated and event emitted');
        } catch (err) {
            logger.error({ userId, err, data }, 'Failed to update user status');
        }
    }

    /**
     * Internal helper to fetch all users for background workers
     */
    async getAllUsersInternal(): Promise<Array<{ userId: string, timezone: string }>> {
        return this.prisma.userProfile.findMany({
            select: { userId: true, timezone: true }
        });
    }

    // ── Admin Methods ────────────────────────────────────────────────────────────

    /**
     * Fetch aggregate platform statistics for the admin dashboard.
     */
    async getAdminStats(): Promise<{
        totalUsers: number;
        activeToday: number;
        bannedUsers: number;
        newUsersThisWeek: number;
        premiumUsers: number;
    }> {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const [totalUsers, activeToday, newUsersThisWeek] = await Promise.all([
            this.prisma.userProfile.count(),
            this.prisma.userProfile.count({
                where: { updatedAt: { gte: oneDayAgo } },
            }),
            this.prisma.userProfile.count({
                where: { createdAt: { gte: oneWeekAgo } },
            }),
        ]);

        // We don't have a dedicated "banned" or "premium" flag on UserProfile,
        // so we return 0 for now — these can be wired up when auth-service
        // exposes status queries or a subscription table is available.
        return {
            totalUsers,
            activeToday,
            bannedUsers: 0,
            newUsersThisWeek,
            premiumUsers: 0,
        };
    }

    /**
     * Fetch a paginated list of user profiles for the admin user-management table.
     */
    async getAdminUsers(opts: { search?: string; limit?: number }): Promise<
        Array<{
            id: string;
            userId: string;
            displayName: string;
            status: string;
            tier: string;
            createdAt: Date;
            lastActiveAt: Date;
        }>
    > {
        const limit = opts.limit ?? 50;

        const where: any = {};
        if (opts.search) {
            where.displayName = { contains: opts.search, mode: 'insensitive' };
        }

        const profiles = await this.prisma.userProfile.findMany({
            where,
            include: { preferences: true },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });

        return profiles.map((p) => ({
            id: p.id,
            userId: p.userId,
            displayName: p.displayName,
            status: 'ACTIVE', // placeholder until auth-service exposes account status
            tier: (p as any).preferences?.primaryGoal === 'GENERAL_HEALTH' ? 'FREE' : 'PRO',
            createdAt: p.createdAt,
            lastActiveAt: p.updatedAt,
        }));
    }

    /**
     * Placeholder for ban/unban toggle.
     * The actual disable logic requires coordination with auth-service.
     */
    async toggleBanUser(targetUserId: string): Promise<{ success: boolean; message: string }> {
        // Verify user exists
        const profile = await this.prisma.userProfile.findUnique({
            where: { userId: targetUserId },
        });

        if (!profile) {
            throw new Error('User not found');
        }

        // TODO: call auth-service to actually disable/enable the account
        logger.info({ targetUserId }, 'Ban toggle requested (stub — requires auth-service integration)');

        return {
            success: true,
            message: `Ban toggle for user ${targetUserId} recorded. Auth-service integration pending.`,
        };
    }

    /**
     * Fetch all students (clients) for a specific coach.
     */
    async getStudents(coachUserId: string) {
        return this.prisma.coachClientRelation.findMany({
            where: {
                coachUserId,
                status: 'ACCEPTED'
            },
            include: {
                // Fetch the client's profile and status for the coach to review
                // profile: { include: { status: true } } // This would depend on Prisma schema structure
            }
        });
    }

    /**
     * Assign a protocol template (from plan-service) to a student.
     */
    async assignProtocol(studentId: string, protocolId: string | null, coachUserId: string) {
        // 1. Verify connection exists and is accepted
        const relation = await this.prisma.coachClientRelation.findUnique({
            where: {
                coachUserId_clientUserId: {
                    coachUserId,
                    clientUserId: studentId
                }
            }
        });

        if (!relation || relation.status !== 'ACCEPTED') {
            throw new Error('Unauthorized: No active coaching relationship with this student');
        }

        // 2. Update student preferences
        return this.prisma.userPreferences.update({
            where: { userId: studentId },
            data: {
                activeProtocolId: protocolId
            }
        });
    }
}
