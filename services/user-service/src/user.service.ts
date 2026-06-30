import { PrismaClient, UserProfile, UserPreferences } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { Channels, UserStatusUpdatedPayload } from '@nightfuel/types';
import { randomUUID } from 'crypto';
import { createLogger } from '@nightfuel/config';
import fs from 'fs';
import path from 'path';
import { UpdateProfileBody, UpdatePreferencesBody, UpdateOnboardingBody, UpdatePrivacyBody } from './schemas';
import { calculateBMI, calculateBMR, calculateTDEE, calculateAge } from './utils/calculators';
import { computeCyclePhase, CyclePhaseInput } from './utils/cyclePhase';
import {
    computeCycleStatsFromLogs,
    buildCycleHistory,
    PeriodLogInput,
} from './utils/cycleHistory';
import { computeCycleForecast, ForecastInput } from './utils/cycleForecast';
import { LogPeriodBody } from './schemas';

const logger = createLogger('user-service:service');

// The `isPrivate` + menstrual-cycle columns are now part of the generated Prisma
// `UserProfile` (schema.prisma + prisma generate own them), so the old "compile
// before generate" shims are removed: re-declaring `cycleTrackingEnabled?: boolean`
// (optional) over the generated required `boolean` made this interface
// "incorrectly extend" UserProfile (TS2430), which broke `tsc`/Build Check.
export interface ProfileWithPreferences extends UserProfile {
    preferences: UserPreferences | null;
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

    // Public profile shape returned by GET /v1/users/public/:userId and the
    // POST /v1/users/public/batch endpoint. Exactly the fields the route exposes.
    public static readonly PUBLIC_PROFILE_FIELDS = {
        userId: true,
        displayName: true,
        avatarUrl: true,
        timezone: true,
        isPrivate: true,
    } as const;

    /**
     * Lean read for the PUBLIC profile surface (GET /v1/users/public/:userId and
     * the /public/batch endpoint).
     *
     * PERF (MEDIUM #9): unlike getProfileWithPreferences, this does NOT call
     * ensureProfileExists() (no userProfile.count() + no auto-create on a public
     * read) and selects ONLY the public fields — never the full over-fetched row
     * with preferences/status. A missing profile simply returns null (the route
     * maps it to 404); a public read must never provision a profile as a side
     * effect.
     */
    async getPublicProfile(userId: string): Promise<{
        id: string;
        displayName: string;
        avatarUrl: string | null;
        timezone: string;
        isPrivate: boolean;
    } | null> {
        const row = await this.prisma.userProfile.findUnique({
            where: { userId },
            // select only the public fields (cast: isPrivate predates the
            // checked-in generated client — same shim precedent as elsewhere).
            select: UserService.PUBLIC_PROFILE_FIELDS as any,
        });
        if (!row) return null;

        const p = row as any;
        return {
            id: p.userId,
            displayName: p.displayName,
            avatarUrl: p.avatarUrl ?? null,
            timezone: p.timezone,
            isPrivate: p.isPrivate ?? false,
        };
    }

    /**
     * Batch variant of getPublicProfile for the community feed author resolver
     * (HIGH #4). Resolves up to `ids.length` user ids in a SINGLE query and
     * returns a map keyed by userId. Ids with no profile are simply absent from
     * the map (mirrors the single-id 404 → "no author" degrade). Caller is
     * responsible for bounding the id count (the route caps it).
     */
    async getPublicProfilesBatch(ids: string[]): Promise<
        Array<{
            id: string;
            displayName: string;
            avatarUrl: string | null;
            timezone: string;
            isPrivate: boolean;
        }>
    > {
        const uniqueIds = [...new Set(ids.filter((id) => !!id))];
        if (uniqueIds.length === 0) return [];

        const rows = await this.prisma.userProfile.findMany({
            where: { userId: { in: uniqueIds } },
            select: UserService.PUBLIC_PROFILE_FIELDS as any,
        });

        return (rows as any[]).map((p) => ({
            id: p.userId,
            displayName: p.displayName,
            avatarUrl: p.avatarUrl ?? null,
            timezone: p.timezone,
            isPrivate: p.isPrivate ?? false,
        }));
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

    /**
     * Fetch the materialized UserStatus, RECOMPUTING the derived cyclePhase at
     * READ time from the stored profile inputs.
     *
     * WHY (staleness fix, mirrors F23's read-time streak fix): cyclePhase was only
     * recomputed on profile UPDATE, so it went stale across days — a user who
     * logged a period and then didn't touch their profile for a week would keep
     * showing the phase computed a week ago. computeCyclePhase is PURE and takes
     * `now`, so we re-derive it here against the current day and RETURN the fresh
     * value. Persist-on-read is optional (we skip the extra write on the hot read
     * path); returning the freshly-computed value is the requirement.
     *
     * Non-tracking / degraded users derive UNKNOWN exactly as before — this is a
     * no-op for them. If the profile/status can't be loaded we fall back to the
     * stored row untouched (best-effort, never throws on the read path).
     */
    async getStatus(userId: string) {
        const status = await this.prisma.userStatus.findUnique({
            where: { userId },
        });
        if (!status) return status;

        try {
            const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
            if (!profile) return status;

            const p = profile as any;
            const freshPhase = computeCyclePhase({
                cycleTrackingEnabled: p.cycleTrackingEnabled,
                biologicalSex: p.biologicalSex,
                hormonalContraception: p.hormonalContraception,
                cycleRegularity: p.cycleRegularity,
                avgCycleLengthDays: p.avgCycleLengthDays,
                avgPeriodLengthDays: p.avgPeriodLengthDays,
                lastPeriodStartDate: p.lastPeriodStartDate,
            });

            // Return a copy with the freshly-derived phase; don't mutate the row in
            // a way that would be persisted by an accidental later write.
            return { ...status, cyclePhase: freshPhase } as typeof status;
        } catch (err) {
            logger.warn({ userId, err }, 'Read-time cyclePhase recompute failed; returning stored status');
            return status;
        }
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

        // ── Menstrual-cycle tracking inputs ──────────────────────────────────
        if (body.cycleTrackingEnabled !== undefined) data.cycleTrackingEnabled = body.cycleTrackingEnabled;
        if (body.avgCycleLengthDays !== undefined) data.avgCycleLengthDays = body.avgCycleLengthDays;
        if (body.avgPeriodLengthDays !== undefined) data.avgPeriodLengthDays = body.avgPeriodLengthDays;
        if (body.cycleRegularity !== undefined) data.cycleRegularity = body.cycleRegularity;
        if (body.hormonalContraception !== undefined) data.hormonalContraception = body.hormonalContraception;
        if (body.lastPeriodStartDate !== undefined) {
            // Same YYYY-MM-DD -> UTC-midnight Date pattern as dateOfBirth above.
            const lpd = body.lastPeriodStartDate;
            data.lastPeriodStartDate = lpd ? new Date(lpd) : null;
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
                //
                // SECURITY (HIGH #9): NEVER log the `data` payload. It carries
                // GDPR Art.9 special-category fields (menstrual-cycle / period /
                // health). We log only userId, the error, and the NAMES of the
                // fields that were being written (never their values) so the
                // diagnostic is still useful without leaking PII.
                if (process.env.NODE_ENV !== 'production') {
                    const errorLog = {
                        timestamp: new Date().toISOString(),
                        userId,
                        err,
                        fields: Object.keys(data),
                    };
                    fs.appendFileSync(
                        path.join(process.cwd(), 'prisma-error.log'),
                        JSON.stringify(errorLog, null, 2) + '\n---\n'
                    );
                }
                logger.error({ userId, err, fields: Object.keys(data) }, 'Prisma error');
                throw err;
            });

            logger.info({ userId }, 'User profile updated');

            // Auto-recalculate baseline metrics
            await this.recalculateBaselines(userId);
            // Auto-recalculate the derived menstrual-cycle phase (UNKNOWN for all
            // non-tracking users — no behavioural change for them).
            await this.recalculateCyclePhase(userId);

            return profile;
        } catch (err: any) {
            // SECURITY (HIGH #9): do NOT log `data` — it contains GDPR Art.9
            // special-category fields. Log userId + err + the field NAMES only.
            logger.error({ userId, err, fields: Object.keys(data) }, 'Failed to upsert user profile');
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
            // SECURITY (MEDIUM #14): do NOT log the raw request `body` — it
            // carries health-adjacent fields (allergies, injury-safe mode,
            // dietary preference). Log userId + err + the NAMES of the fields
            // being written (never their values).
            logger.error({ userId, err, fields: Object.keys(body ?? {}) }, 'Failed to update user preferences');
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
     * Internal helper to derive & persist the menstrual-cycle phase.
     *
     * Sibling of recalculateBaselines: loads the profile, runs the PURE,
     * fully-gated computeCyclePhase over the raw cycle inputs, and writes the
     * result to UserStatus.cyclePhase via the existing updateUserStatus upsert.
     *
     * Non-tracking users (cycleTrackingEnabled=false — the default) always derive
     * UNKNOWN, so this is a no-op-equivalent for them: it only ever writes the
     * 'UNKNOWN' sentinel, which downstream services treat as "no phase-syncing".
     */
    private async recalculateCyclePhase(userId: string): Promise<void> {
        try {
            const profile = await this.prisma.userProfile.findUnique({
                where: { userId },
            });
            if (!profile) return;

            // The generated Prisma client may predate the cycle columns (the
            // schema + migration own the runtime columns; `prisma generate`
            // catches the types up). Read through `any` so this compiles before
            // regeneration — mirrors the isPrivate shim precedent.
            const p = profile as any;
            const input: CyclePhaseInput = {
                cycleTrackingEnabled: p.cycleTrackingEnabled,
                biologicalSex: p.biologicalSex,
                hormonalContraception: p.hormonalContraception,
                cycleRegularity: p.cycleRegularity,
                avgCycleLengthDays: p.avgCycleLengthDays,
                avgPeriodLengthDays: p.avgPeriodLengthDays,
                lastPeriodStartDate: p.lastPeriodStartDate,
            };

            const cyclePhase = computeCyclePhase(input);

            await this.updateUserStatus(userId, {
                cyclePhase,
                lastUpdatedBy: 'user-service:cycle-phase',
            });

            logger.debug({ userId, cyclePhase }, 'Recalculated cycle phase');
        } catch (err) {
            logger.error({ userId, err }, 'Failed to recalculate cycle phase');
        }
    }

    /**
     * Update the materialized UserStatus (Digital Twin).
     */
    async updateUserStatus(userId: string, data: {
        fatigueScore?: number;
        circadianPeakTime?: string | null;
        circadianLowTime?: string | null;
        cyclePhase?: string | null;
        adherenceRate?: number;
        currentStreak?: number;
        currentTdee?: number;
        weightTrend?: string;
        lastUpdatedBy: string;
    }): Promise<void> {
        try {
            // Cast create/update to `any`: `cyclePhase` is a new column the
            // checked-in generated client may predate (schema + migration own the
            // runtime column; `prisma generate` catches the types up). Same shim
            // precedent as isPrivate / the ProfileWithPreferences cast.
            const status = await this.prisma.userStatus.upsert({
                where: { userId },
                create: {
                    userId,
                    ...data,
                } as any,
                update: data as any,
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
     * Internal helper to fetch users for background workers (e.g. plan-service's
     * daily-regeneration worker).
     *
     * PERF (HIGH #3): this used to do an UNBOUNDED userProfile.findMany() with no
     * `take`, loading EVERY profile into memory on every 60s poll. It is now
     * CURSOR-PAGINATED: each call returns at most `limit` rows ordered by the
     * stable `userId` cursor plus a `nextCursor` to continue from. The worker
     * pages through batches until `nextCursor` is null, so behaviour is
     * equivalent (it still processes all users) but every query is bounded.
     *
     * @param opts.cursor  exclusive userId to resume after (omit for the first page)
     * @param opts.limit   page size (1..MAX_INTERNAL_PAGE_LIMIT, default 500)
     */
    async getAllUsersInternal(opts?: { cursor?: string; limit?: number }): Promise<{
        users: Array<{ userId: string; timezone: string }>;
        nextCursor: string | null;
    }> {
        const MAX_LIMIT = 1000;
        const DEFAULT_LIMIT = 500;
        const rawLimit = opts?.limit ?? DEFAULT_LIMIT;
        const limit = Math.min(Math.max(1, Math.floor(rawLimit)), MAX_LIMIT);

        const users = await this.prisma.userProfile.findMany({
            select: { userId: true, timezone: true },
            orderBy: { userId: 'asc' },
            take: limit,
            // Skip the cursor row itself when resuming a page.
            ...(opts?.cursor
                ? { cursor: { userId: opts.cursor }, skip: 1 }
                : {}),
        });

        // A full page MAY have more rows; a short page is the last page.
        const nextCursor =
            users.length === limit ? users[users.length - 1].userId : null;

        return { users, nextCursor };
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
        coaches: number;
        availableCoaches: number;
    }> {
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const [totalUsers, activeToday, newUsersThisWeek, coaches, availableCoaches] = await Promise.all([
            this.prisma.userProfile.count(),
            this.prisma.userProfile.count({
                where: { updatedAt: { gte: oneDayAgo } },
            }),
            this.prisma.userProfile.count({
                where: { createdAt: { gte: oneWeekAgo } },
            }),
            // Coach metrics live in user-service's own DB (coach_profiles), so
            // these are REAL counts — no cross-service call needed.
            this.prisma.coachProfile.count(),
            this.prisma.coachProfile.count({ where: { isAvailable: true } }),
        ]);

        // banned/premium still need auth-service status + a subscription source;
        // they stay 0 until those land (later phases).
        return {
            totalUsers,
            activeToday,
            bannedUsers: 0,
            newUsersThisWeek,
            premiumUsers: 0,
            coaches,
            availableCoaches,
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

    // ── Menstrual-cycle: period logging + history + forecast ──────────────────

    /** Load a user's PeriodLog rows (oldest-first), as pure-helper inputs. */
    private async loadPeriodLogs(userId: string): Promise<PeriodLogInput[]> {
        // PeriodLog is a new model the checked-in generated client may predate
        // (schema + migration own the runtime table; `prisma generate` catches the
        // types up). Access through `any`, same shim precedent as the cycle columns.
        const rows = await (this.prisma as any).periodLog.findMany({
            where: { userId },
            orderBy: { startDate: 'asc' },
        });
        return (rows ?? []).map((r: any) => ({ startDate: r.startDate, endDate: r.endDate }));
    }

    /**
     * Log a period start (+ optional end), then RECOMPUTE the user's learned cycle
     * stats FROM their full logged history and the derived phase.
     *
     * Flow:
     *   1. Append a PeriodLog row.
     *   2. computeCycleStatsFromLogs(history) — learns avgCycleLength /
     *      avgPeriodLength / regularity / lastPeriodStartDate from the USER'S OWN
     *      data (never the static 28/14 template once history exists).
     *   3. Persist those learned values onto UserProfile (only fields the helper
     *      could actually derive — null results never clobber a stored value).
     *   4. recalculateCyclePhase -> UserStatus.cyclePhase.
     *
     * Gated to the caller's own userId by the route. Returns the fresh stats.
     */
    async logPeriod(userId: string, body: LogPeriodBody) {
        await this.ensureProfileExists(userId);

        // IDEMPOTENCY (data-integrity LOW #9): a double-submit of the same period
        // start must not duplicate a row (duplicate starts skew the learned
        // averages). createMany({ skipDuplicates: true }) no-ops against the
        // @@unique([userId, startDate]) constraint instead of throwing, so a
        // re-submit silently keeps the single existing row and we still recompute
        // + return the current stats below.
        await (this.prisma as any).periodLog.createMany({
            data: [{
                userId,
                startDate: new Date(body.startDate),
                endDate: body.endDate ? new Date(body.endDate) : null,
            }],
            skipDuplicates: true,
        });

        const logs = await this.loadPeriodLogs(userId);
        const stats = computeCycleStatsFromLogs(logs);

        // Persist learned values. Only write fields the history could derive, so a
        // single log (no computable gap) never wipes a user's stored cycle length.
        const data: Record<string, unknown> = {};
        if (stats.lastPeriodStartDate) data.lastPeriodStartDate = stats.lastPeriodStartDate;
        if (stats.avgCycleLengthDays != null) data.avgCycleLengthDays = stats.avgCycleLengthDays;
        if (stats.avgPeriodLengthDays != null) data.avgPeriodLengthDays = stats.avgPeriodLengthDays;
        if (stats.cycleRegularity !== 'UNKNOWN') data.cycleRegularity = stats.cycleRegularity;

        if (Object.keys(data).length > 0) {
            await this.prisma.userProfile.update({ where: { userId }, data: data as any });
        }

        // Re-derive the phase against the freshly-learned inputs.
        await this.recalculateCyclePhase(userId);

        logger.info({ userId, loggedCycleCount: stats.loggedCycleCount }, 'Period logged + cycle stats recomputed');
        return {
            ...stats,
            lastPeriodStartDate: stats.lastPeriodStartDate
                ? stats.lastPeriodStartDate.toISOString().slice(0, 10)
                : null,
        };
    }

    /**
     * Return the user's cycle history: each past cycle with its length + period
     * length, plus the learned averages / variability. PURE-derived from logs.
     */
    async getCycleHistory(userId: string) {
        const logs = await this.loadPeriodLogs(userId);
        const stats = computeCycleStatsFromLogs(logs);
        return {
            cycles: buildCycleHistory(logs),
            averages: {
                avgCycleLengthDays: stats.avgCycleLengthDays,
                avgPeriodLengthDays: stats.avgPeriodLengthDays,
                cycleLengthStdDev: stats.cycleLengthStdDev,
                cycleRegularity: stats.cycleRegularity,
                loggedCycleCount: stats.loggedCycleCount,
            },
        };
    }

    /**
     * Build the uncertainty-aware cycle forecast/calendar for a window. Combines
     * the stored profile inputs with the LEARNED history signals (SD, logged
     * count, regularity) and the set of actual logged days (for logged-vs-
     * predicted), then defers to the pure computeCycleForecast.
     *
     * @param months  half-window in months (default 1) -> [today - m, today + m].
     */
    async getCycleForecast(userId: string, months = 1) {
        const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
        const logs = await this.loadPeriodLogs(userId);
        const stats = computeCycleStatsFromLogs(logs);

        const p = (profile ?? {}) as any;

        // Prefer LEARNED values from history where available; else the stored
        // template inputs. cycleRegularity prefers a learned IRREGULAR signal.
        const input: ForecastInput = {
            cycleTrackingEnabled: p.cycleTrackingEnabled,
            biologicalSex: p.biologicalSex,
            hormonalContraception: p.hormonalContraception,
            cycleRegularity:
                stats.cycleRegularity !== 'UNKNOWN' ? stats.cycleRegularity : p.cycleRegularity,
            avgCycleLengthDays: stats.avgCycleLengthDays ?? p.avgCycleLengthDays,
            avgPeriodLengthDays: stats.avgPeriodLengthDays ?? p.avgPeriodLengthDays,
            lastPeriodStartDate: stats.lastPeriodStartDate ?? p.lastPeriodStartDate,
            cycleLengthStdDev: stats.cycleLengthStdDev,
            loggedCycleCount: stats.loggedCycleCount,
            loggedPeriodDates: this.expandLoggedDates(logs),
        };

        const now = new Date();
        const windowStart = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, now.getUTCDate()),
        );
        const windowEnd = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + months, now.getUTCDate()),
        );

        return computeCycleForecast(input, windowStart, windowEnd, now);
    }

    // ── GDPR account deletion (own-data purge + event) ────────────────────────

    /**
     * Authoritatively purge EVERY user-service-OWNED row for this userId, in a
     * single transaction. Backs the own-data step of the DELETE /v1/users/me
     * orchestrator.
     *
     * The set of tables comes straight from the user-service ownership inventory:
     *   user_profiles            (user_id)
     *   user_preferences         (user_id)
     *   coach_profiles           (user_id)
     *   coach_client_relations   (coach_user_id, client_user_id)  ← TWO ownership
     *                                                                columns; the
     *                                                                user may be on
     *                                                                EITHER side, so
     *                                                                we delete both.
     *   period_logs              (user_id)   ← GDPR Art.9 special-category health
     *   user_statuses            (user_id)
     *
     * IDEMPOTENT: every delete is a `deleteMany` (returns { count }, never throws
     * on zero matches), so purging a user with no rows succeeds with all counts 0,
     * and purging the same user twice is safe. All deletes run inside ONE
     * interactive transaction so the own-data purge is atomic — the user is never
     * left half-deleted within this service.
     *
     * Children are deleted before parents (coach_client_relations before
     * coach_profiles; the rest are independent) so the counts are accurate
     * regardless of FK-cascade behaviour.
     */
    async purgeOwnUserData(userId: string): Promise<{
        userId: string;
        deletedCounts: Record<string, number>;
    }> {
        const p = this.prisma as any;
        const [
            coachClientRelations,
            periodLogs,
            userStatuses,
            userPreferences,
            coachProfiles,
            userProfiles,
        ] = await this.prisma.$transaction([
            // coach_client_relations: the user can be the coach OR the client.
            p.coachClientRelation.deleteMany({
                where: { OR: [{ coachUserId: userId }, { clientUserId: userId }] },
            }),
            p.periodLog.deleteMany({ where: { userId } }),
            this.prisma.userStatus.deleteMany({ where: { userId } }),
            this.prisma.userPreferences.deleteMany({ where: { userId } }),
            p.coachProfile.deleteMany({ where: { userId } }),
            // Parent profile last.
            this.prisma.userProfile.deleteMany({ where: { userId } }),
        ]);

        const deletedCounts: Record<string, number> = {
            coach_client_relations: coachClientRelations.count,
            period_logs: periodLogs.count,
            user_statuses: userStatuses.count,
            user_preferences: userPreferences.count,
            coach_profiles: coachProfiles.count,
            user_profiles: userProfiles.count,
        };

        logger.info({ userId, deletedCounts }, 'Purged user-service own data (GDPR)');
        return { userId, deletedCounts };
    }

    // ── GDPR data export (own-data gather, read-only) ─────────────────────────

    /**
     * Read-only twin of purgeOwnUserData: gather EVERY user-service-OWNED row for
     * this userId into a single plain object, for the GDPR data-portability bundle
     * (GET /v1/users/me/export). Mirrors EXACTLY the ownership inventory that the
     * deletion orchestrator purges, so "what we delete" and "what we export" can
     * never drift apart:
     *   user_profiles            (user_id)
     *   user_preferences         (user_id)
     *   coach_profiles           (user_id)
     *   coach_client_relations   (coach_user_id OR client_user_id)  ← both sides
     *   period_logs              (user_id)   ← GDPR Art.9 special-category health
     *   user_statuses            (user_id)   ← incl. the read-time-fresh cyclePhase
     *
     * Plus the read-only DERIVED cycle views the user can see in-app (history +
     * forecast), so the export is a faithful, portable snapshot of their data.
     *
     * NO secrets/credentials live in user-service (it holds no password — auth
     * owns that), so nothing here needs redaction; auth's own /export excludes
     * the credential material.
     *
     * Best-effort per section: a failure gathering one section is captured as
     * { error } in that slot rather than failing the whole own-data gather, so
     * the bundle is as complete as possible (the route still fans out either way).
     */
    async gatherOwnUserData(userId: string): Promise<Record<string, unknown>> {
        const p = this.prisma as any;

        // Run the independent reads concurrently; each is individually guarded so
        // one failing query degrades only its own slot.
        const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | { error: string }> => {
            try {
                return await fn();
            } catch (err: any) {
                logger.error({ userId, section: label, err }, 'Failed to gather own-data section for export');
                return { error: err?.message ?? 'gather failed' };
            }
        };

        const [profile, preferences, status, coachProfile, coachClientRelations, periodLogs, cycleHistory, cycleForecast] =
            await Promise.all([
                safe('profile', () => this.prisma.userProfile.findUnique({ where: { userId } })),
                safe('preferences', () => this.prisma.userPreferences.findUnique({ where: { userId } })),
                // getStatus recomputes the read-time-fresh cyclePhase.
                safe('status', () => this.getStatus(userId)),
                safe('coachProfile', () => p.coachProfile.findUnique({ where: { userId } })),
                safe('coachClientRelations', () =>
                    this.prisma.coachClientRelation.findMany({
                        where: { OR: [{ coachUserId: userId }, { clientUserId: userId }] },
                    }),
                ),
                safe('periodLogs', () =>
                    p.periodLog.findMany({ where: { userId }, orderBy: { startDate: 'asc' } }),
                ),
                // Read-only derived views the user sees in-app.
                safe('cycleHistory', () => this.getCycleHistory(userId)),
                safe('cycleForecast', () => this.getCycleForecast(userId, 1)),
            ]);

        return {
            userId,
            profile,
            preferences,
            status,
            coachProfile,
            coachClientRelations,
            periodLogs,
            cycleHistory,
            cycleForecast,
        };
    }

    /**
     * Best-effort USER_DELETED event for any async consumers (caches, search
     * indexes, analytics). NEVER throws — the account deletion is already
     * authoritative without it; a bus hiccup must not fail the user's request.
     */
    async emitUserDeleted(userId: string): Promise<void> {
        try {
            await this.eventBus.publish(Channels.Auth.UserDeleted, {
                eventId: randomUUID(),
                eventType: 'user.deleted',
                producedAt: new Date().toISOString(),
                producerService: 'user-service',
                correlationId: randomUUID(),
                userId,
                payload: { userId, deletedAt: new Date().toISOString() },
            });
            logger.info({ userId }, 'USER_DELETED event emitted');
        } catch (err) {
            // Best-effort: log and move on. Consumers can also reconcile from the
            // per-service purge that already ran.
            logger.error({ userId, err }, 'Failed to emit USER_DELETED event (best-effort)');
        }
    }

    /** Expand each logged period (start..end inclusive) into a flat ISO date set. */
    private expandLoggedDates(logs: PeriodLogInput[]): string[] {
        const out = new Set<string>();
        const MS = 24 * 60 * 60 * 1000;
        for (const l of logs) {
            const s = l.startDate instanceof Date ? l.startDate : new Date(l.startDate);
            if (Number.isNaN(s.getTime())) continue;
            const startMs = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
            const e = l.endDate ? (l.endDate instanceof Date ? l.endDate : new Date(l.endDate)) : null;
            const endMs =
                e && !Number.isNaN(e.getTime())
                    ? Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate())
                    : startMs;
            for (let ms = startMs; ms <= endMs && ms - startMs < 60 * MS; ms += MS) {
                out.add(new Date(ms).toISOString().slice(0, 10));
            }
        }
        return Array.from(out);
    }
}
