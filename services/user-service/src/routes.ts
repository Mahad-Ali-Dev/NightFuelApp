
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sendUnauthorizedPayload, makeInternalAuthGuard } from '@nightfuel/config';
import {
    updateProfileSchema,
    updatePreferencesSchema,
    updateOnboardingSchema,
    updatePrivacySchema,
    logPeriodSchema,
    cycleForecastQuerySchema,
} from './schemas';
import { z } from 'zod';
import { UserService } from './user.service';
import { fanOutPurge, ServicePurgeResult } from './account-deletion';
import { fanOutExport, assembleServicesMap, DataExportBundle } from './data-export';

// ── Shared userId extractor ───────────────────────────────────────────────────
// auth-service signs JWTs with { userId, role }. @fastify/jwt attaches the
// decoded payload as request.user, so we read .userId (primary) or .id (legacy).
// On failure we delegate to the canonical sendUnauthorizedPayload helper
// (packages/config/src/auth-errors.ts) — that keeps the wire body identical to
// every other service. Returning `null` is the signal callers use to short-
// circuit before doing any DB work (see `if (!userId) return;` at every call
// site below).
function extractUserId(request: FastifyRequest, reply: FastifyReply): string | null {
    const user = request.user as any;
    const userId: string | undefined = user?.userId ?? user?.id;
    if (!userId || typeof userId !== 'string') {
        sendUnauthorizedPayload(reply, request);
        return null;
    }
    return userId;
}

// ── Admin role guard ─────────────────────────────────────────────────────────
// Returns true if the user has ADMIN role, otherwise sends a 403 and returns false.
function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
    const user = request.user as any;
    if (user?.role !== 'ADMIN') {
        reply.code(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: 'Admin access required.',
        });
        return false;
    }
    return true;
}

export const userRoutes = async (
    fastify: FastifyInstance,
    opts: {
        userService: UserService;
        internalServiceToken?: string;
        // Seam for tests: override the inter-service fan-out so the DELETE /me
        // orchestrator can be exercised without real HTTP. Defaults to the real
        // fanOutPurge (native fetch + X-Internal-Token to every owning service).
        fanOut?: typeof fanOutPurge;
        // Seam for tests: override the data-export fan-out so the GET /me/export
        // orchestrator can be exercised without real HTTP. Defaults to the real
        // fanOutExport (native fetch + X-Internal-Token GET to every owning service).
        fanOutExp?: typeof fanOutExport;
    }
): Promise<void> => {
    const service = opts.userService;
    const fanOut = opts.fanOut ?? fanOutPurge;
    const fanOutExp = opts.fanOutExp ?? fanOutExport;

    // F34 #5: in-service guard for the server-to-server-only /internal/* routes.
    // Constant-time checks X-Internal-Token == INTERNAL_SERVICE_TOKEN; on
    // missing/wrong token it 404s (same as the nginx edge — never reveal the
    // route). Callers (chat/plan/progress) send the header. This is
    // defense-in-depth behind the edge 404, not a replacement for it.
    const internalAuth = makeInternalAuthGuard(opts.internalServiceToken);

    // ── GET /v1/users/me ──────────────────────────────────────────────────────
    // Returns the authenticated user's full profile including nested preferences.
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/me',
        {
            onRequest: [(fastify as any).authenticate],
        },
        async (request, reply) => {
            try {
                const userId = extractUserId(request, reply);
                if (!userId) return;

                const profile = await service.getProfileWithPreferences(userId);
                if (!profile) {
                    return reply.code(404).send({ error: 'Profile not found' });
                }

                return reply.code(200).send(profile);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── GET /v1/users/public/:userId ──────────────────────────────────────────
    // Returns basic public profile information for another user
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/public/:userId',
        {
            onRequest: [(fastify as any).authenticate],
            schema: { params: z.object({ userId: z.string() }) }
        },
        async (request, reply) => {
            try {
                const { userId } = request.params as { userId: string };
                // PERF (MEDIUM #9): lean public read — no ensureProfileExists()
                // count()/auto-create, selects ONLY the public fields below. A
                // missing profile 404s (never provisioned by a public read). The
                // returned object is already the exact public shape.
                const profile = await service.getPublicProfile(userId);
                if (!profile) {
                    return reply.code(404).send({ error: 'Profile not found' });
                }

                // isPrivate is part of the public social contract (community-service
                // composes detailed profile access from it).
                return reply.code(200).send(profile);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── POST /v1/users/public/batch ───────────────────────────────────────────
    // PERF (HIGH #4): batch sibling of GET /v1/users/public/:userId. Resolves an
    // array of user ids to the SAME public profile shape in ONE round-trip, so the
    // community feed's author resolver can enrich a whole page of posts without N
    // separate HTTP GETs. PUBLIC route (same auth as /public/:userId — NOT
    // internal-token guarded). Bounded to MAX_BATCH ids per request. Returns
    // { users: PublicProfile[] }; ids with no profile are simply absent (mirrors
    // the single-id 404 → "no author" degrade).
    const MAX_BATCH = 100;
    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/public/batch',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: z.object({
                    ids: z.array(z.string()).min(1).max(MAX_BATCH),
                }),
            },
        },
        async (request, reply) => {
            try {
                const { ids } = request.body as { ids: string[] };
                const users = await service.getPublicProfilesBatch(ids);
                return reply.code(200).send({ users });
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── PUT /v1/users/me ──────────────────────────────────────────────────────
    // Partially update the authenticated user's profile fields.
    fastify.withTypeProvider<ZodTypeProvider>().put(
        '/me',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: updateProfileSchema,
            },
        },
        async (request, reply) => {
            try {
                const userId = extractUserId(request, reply);
                if (!userId) return;

                const profile = await service.updateProfile(userId, request.body);
                return reply.code(200).send(profile);
            } catch (err: any) {
                request.log.error(err);

                if (err.message === 'Profile not found') {
                    // Fixed literal — never echo err.message verbatim. Real error logged above.
                    return reply.code(404).send({ error: 'Profile not found' });
                }

                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── PATCH /v1/users/me ────────────────────────────────────────────────────
    // Update the authenticated user's account-visibility flag (public/private).
    // Backs the social public/private contract; keeps PUT /me (full profile)
    // untouched. Returns the updated profile so callers read back isPrivate.
    fastify.withTypeProvider<ZodTypeProvider>().patch(
        '/me',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: updatePrivacySchema,
            },
        },
        async (request, reply) => {
            try {
                const userId = extractUserId(request, reply);
                if (!userId) return;

                const profile = await service.updatePrivacy(userId, request.body);
                return reply.code(200).send(profile);
            } catch (err: any) {
                request.log.error(err);

                if (err.message === 'Profile not found') {
                    // Fixed literal — never echo err.message verbatim. Real error logged above.
                    return reply.code(404).send({ error: 'Profile not found' });
                }

                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── DELETE /v1/users/me ───────────────────────────────────────────────────
    // GDPR "delete my account" ORCHESTRATOR. Erases the CALLING user everywhere.
    //
    // SECURITY (no IDOR): the userId comes ONLY from the verified JWT
    // (extractUserId → request.user.userId). There is NO body/param userId, so a
    // user can only ever delete THEIR OWN account — a forged body can't redirect
    // the deletion at someone else.
    //
    // Steps:
    //   1. Authoritatively purge user-service's OWN tables (transactional,
    //      idempotent deleteMany over the ownership inventory).
    //   2. Fan out DELETE /v1/<svc>/internal/user/:userId to EVERY owning service
    //      (auth-service included — it holds the canonical credentials) with the
    //      shared X-Internal-Token. Auth credentials are erased via auth's purge.
    //   3. RESILIENT: attempt all services, collect per-service success/failure.
    //      All-ok → 200; any failure → 207 multi-status with the per-service list
    //      so the failures are visible + logged for retry (never silently half-
    //      deleted). The own-data purge already succeeded authoritatively.
    //   4. IDEMPOTENT: a re-delete of an already-deleted account returns success
    //      (own purge counts come back 0; downstream purges deleteMany → 2xx).
    //   5. Best-effort USER_DELETED event for async consumers.
    fastify.withTypeProvider<ZodTypeProvider>().delete(
        '/me',
        {
            onRequest: [(fastify as any).authenticate],
        },
        async (request, reply) => {
            try {
                // IDENTITY: JWT only. Never read a userId from body/params here.
                const userId = extractUserId(request, reply);
                if (!userId) return;

                // 1. Own data first — this is the authoritative deletion for the
                //    PII this service owns. If it throws, we 500 (nothing erased
                //    elsewhere yet, so the client can safely retry).
                const ownData = await service.purgeOwnUserData(userId);

                // 2 + 3. Fan out to every owning service (auth included), resilient.
                const services: ServicePurgeResult[] = await fanOut(
                    userId,
                    opts.internalServiceToken ?? ''
                );

                // 5. Best-effort event (never throws).
                await service.emitUserDeleted(userId);

                const failures = services.filter((s) => !s.ok);
                if (failures.length > 0) {
                    request.log.error(
                        { userId, failures },
                        'GDPR deletion: some downstream services failed to purge (queued for retry)'
                    );
                    // 207-style summary: own data + auth/others that succeeded are
                    // authoritative; the listed failures need retry.
                    return reply.code(207).send({
                        userId,
                        status: 'partial',
                        ownData,
                        services,
                    });
                }

                return reply.code(200).send({
                    userId,
                    status: 'deleted',
                    ownData,
                    services,
                });
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── GET /v1/users/me/export ───────────────────────────────────────────────
    // GDPR "export my data" ORCHESTRATOR (Art. 20 portability). Returns a SINGLE
    // machine-readable JSON bundle of ALL the CALLING user's data across the
    // platform. Read-only twin of DELETE /v1/users/me.
    //
    // SECURITY (no IDOR): the userId comes ONLY from the verified JWT
    // (extractUserId → request.user.userId). There is NO body/param userId, so a
    // user can only ever export THEIR OWN data — a forged param can't redirect
    // the export at someone else's account.
    //
    // Steps:
    //   1. Gather user-service's OWN user-owned data (profile, preferences,
    //      status, coach profile/relations, period logs, derived cycle history +
    //      forecast) — the SAME ownership inventory the deletion orchestrator
    //      purges, read-only.
    //   2. Fan out GET /v1/<svc>/internal/user/:userId/export to EVERY owning
    //      service (auth included) with the shared X-Internal-Token.
    //   3. RESILIENT: attempt all services, fold each into the `services` map —
    //      the exported data on success, or { error } in that slot on failure
    //      (best-effort completeness; a single unreachable service NEVER fails
    //      the whole export — mirrors the deletion orchestrator's partial summary).
    //   4. SECRETS: the per-service /export endpoints already exclude credentials;
    //      this orchestrator only relays their JSON verbatim and never injects any.
    //
    // Always 200 with the full bundle (per-service failures are visible in-band as
    // { error } slots, not an HTTP failure — the user still receives a portable
    // export of everything that responded).
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/me/export',
        {
            onRequest: [(fastify as any).authenticate],
        },
        async (request, reply) => {
            try {
                // IDENTITY: JWT only. Never read a userId from body/params here.
                const userId = extractUserId(request, reply);
                if (!userId) return;

                // 1. Own data + 2. fan-out to every owning service, concurrently.
                const [self, results] = await Promise.all([
                    service.gatherOwnUserData(userId),
                    fanOutExp(userId, opts.internalServiceToken ?? ''),
                ]);

                // 3. Fold per-service results (data | { error }) into the bundle.
                const services = assembleServicesMap(results);

                const failures = results.filter((r) => r.error !== undefined);
                if (failures.length > 0) {
                    request.log.error(
                        { userId, failures: failures.map((f) => ({ service: f.service, error: f.error })) },
                        'GDPR export: some services failed to export (degraded slots returned as { error })'
                    );
                }

                const bundle: DataExportBundle = {
                    exportedAt: new Date().toISOString(),
                    userId,
                    self,
                    services,
                };

                return reply.code(200).send(bundle);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── GET /v1/users/me/preferences ─────────────────────────────────────────
    // Returns only the authenticated user's nutritional preference settings.
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/me/preferences',
        {
            onRequest: [(fastify as any).authenticate],
        },
        async (request, reply) => {
            try {
                const userId = extractUserId(request, reply);
                if (!userId) return;

                const prefs = await service.getPreferences(userId);
                if (!prefs) {
                    return reply.code(404).send({ error: 'Preferences not found' });
                }

                return reply.code(200).send(prefs);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── PUT /v1/users/me/preferences ─────────────────────────────────────────
    // Partially update the authenticated user's nutritional preferences.
    fastify.withTypeProvider<ZodTypeProvider>().put(
        '/me/preferences',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: updatePreferencesSchema,
            },
        },
        async (request, reply) => {
            try {
                const userId = extractUserId(request, reply);
                if (!userId) return;

                const prefs = await service.updatePreferences(userId, request.body);
                return reply.code(200).send(prefs);
            } catch (err: any) {
                request.log.error(err);
                if (err.message?.includes('not found')) {
                    // Fixed literal — never echo err.message verbatim. Real error logged above.
                    return reply.code(404).send({ error: 'Preferences not found' });
                }
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── PUT /v1/users/me/onboarding ───────────────────────────────────────────
    // Advance or complete the authenticated user's onboarding flow.
    fastify.withTypeProvider<ZodTypeProvider>().put(
        '/me/onboarding',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: updateOnboardingSchema,
            },
        },
        async (request, reply) => {
            try {
                const userId = extractUserId(request, reply);
                if (!userId) return;

                const profile = await service.updateOnboarding(userId, request.body);
                return reply.code(200).send(profile);
            } catch (err: any) {
                request.log.error(err);
                if (err.message === 'Profile not found') {
                    // Fixed literal — never echo err.message verbatim. Real error logged above.
                    return reply.code(404).send({ error: 'Profile not found' });
                }
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── GET /v1/users/me/status ──────────────────────────────────────────────
    // Returns the digital twin status (fatigue, adherence, etc.) for the current user.
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/me/status',
        {
            onRequest: [(fastify as any).authenticate],
        },
        async (request, reply) => {
            try {
                const userId = extractUserId(request, reply);
                if (!userId) return;

                const status = await service.getStatus(userId);
                if (!status) {
                    return reply.code(404).send({ error: 'Status not found' });
                }

                return reply.code(200).send(status);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── Menstrual-cycle Routes ───────────────────────────────────────────────
    // All cycle routes require auth and are gated to the caller's OWN userId
    // (extractUserId is the only identity source — there is no path param), so a
    // user can never read or write another user's cycle data.

    // POST /v1/users/me/cycle/period — log a period start (+ optional end).
    // Appends a PeriodLog, then recomputes learned avgCycleLength /
    // avgPeriodLength / regularity FROM the user's own history + the phase.
    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/me/cycle/period',
        {
            onRequest: [(fastify as any).authenticate],
            schema: { body: logPeriodSchema },
        },
        async (request, reply) => {
            try {
                const userId = extractUserId(request, reply);
                if (!userId) return;

                const stats = await service.logPeriod(userId, request.body as any);
                return reply.code(201).send(stats);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // GET /v1/users/me/cycle/history — past cycles + learned averages/variability.
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/me/cycle/history',
        {
            onRequest: [(fastify as any).authenticate],
        },
        async (request, reply) => {
            try {
                const userId = extractUserId(request, reply);
                if (!userId) return;

                const history = await service.getCycleHistory(userId);
                return reply.code(200).send(history);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // GET /v1/users/me/cycle/forecast — uncertainty-aware per-day phase calendar,
    // predicted next-period / fertile-window / ovulation, confidence + logged flag.
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/me/cycle/forecast',
        {
            onRequest: [(fastify as any).authenticate],
            schema: { querystring: cycleForecastQuerySchema },
        },
        async (request, reply) => {
            try {
                const userId = extractUserId(request, reply);
                if (!userId) return;

                const { months } = request.query as { months?: number };
                const forecast = await service.getCycleForecast(userId, months ?? 1);
                return reply.code(200).send(forecast);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── Specialist / Coach Routes ────────────────────────────────────────────

    // GET /v1/users/me/students — Fetch all students for the current coach
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/me/students',
        {
            onRequest: [(fastify as any).authenticate],
        },
        async (request, reply) => {
            try {
                const userId = extractUserId(request, reply);
                if (!userId) return;

                const students = await service.getStudents(userId);
                return reply.code(200).send(students);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // POST /v1/users/students/:studentId/assign-protocol — Assign a protocol template
    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/students/:studentId/assign-protocol',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                params: z.object({ studentId: z.string().uuid() }),
                body: z.object({ protocolId: z.string().uuid().nullable() }),
            },
        },
        async (request, reply) => {
            try {
                const coachUserId = extractUserId(request, reply);
                if (!coachUserId) return;

                const { studentId } = request.params as { studentId: string };
                const { protocolId } = request.body as { protocolId: string | null };

                await service.assignProtocol(studentId, protocolId, coachUserId);
                return reply.code(200).send({ success: true });
            } catch (err: any) {
                request.log.error(err);
                if (err.message.includes('Unauthorized')) {
                    return reply.code(403).send({ error: 'Forbidden' });
                }
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── Coach ↔ client lifecycle ─────────────────────────────────────────────

    // POST /v1/users/coaches/:coachUserId/request — a client requests a coach
    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/coaches/:coachUserId/request',
        {
            onRequest: [(fastify as any).authenticate],
            schema: { params: z.object({ coachUserId: z.string().uuid() }) },
        },
        async (request, reply) => {
            try {
                const clientUserId = extractUserId(request, reply);
                if (!clientUserId) return;
                const { coachUserId } = request.params as { coachUserId: string };
                const result = await service.requestCoach(clientUserId, coachUserId);
                return reply.code(200).send(result);
            } catch (err: any) {
                request.log.error(err);
                if (err.statusCode === 400) return reply.code(400).send({ error: 'Invalid request' });
                if (err.statusCode === 404) return reply.code(404).send({ error: 'Coach not found' });
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // GET /v1/users/me/coach-requests — a coach's incoming PENDING requests
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/me/coach-requests',
        { onRequest: [(fastify as any).authenticate] },
        async (request, reply) => {
            try {
                const coachUserId = extractUserId(request, reply);
                if (!coachUserId) return;
                const requests = await service.getCoachRequests(coachUserId);
                return reply.code(200).send(requests);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // POST /v1/users/coach-requests/:id/accept | /decline — coach responds
    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/coach-requests/:id/:action',
        {
            onRequest: [(fastify as any).authenticate],
            schema: { params: z.object({ id: z.string().uuid(), action: z.enum(['accept', 'decline']) }) },
        },
        async (request, reply) => {
            try {
                const coachUserId = extractUserId(request, reply);
                if (!coachUserId) return;
                const { id, action } = request.params as { id: string; action: 'accept' | 'decline' };
                const result = await service.respondToCoachRequest(id, coachUserId, action === 'accept');
                return reply.code(200).send(result);
            } catch (err: any) {
                request.log.error(err);
                if (err.statusCode === 404) return reply.code(404).send({ error: 'Request not found' });
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // GET /v1/users/me/coach — a client's current (accepted) coach, or null
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/me/coach',
        { onRequest: [(fastify as any).authenticate] },
        async (request, reply) => {
            try {
                const clientUserId = extractUserId(request, reply);
                if (!clientUserId) return;
                const coach = await service.getMyCoach(clientUserId);
                return reply.code(200).send(coach);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── Admin Routes ───────────────────────────────────────────────────────────

    // GET /v1/users/admin/stats — Platform-wide statistics for admin dashboard
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/admin/stats',
        {
            onRequest: [(fastify as any).authenticate],
        },
        async (request, reply) => {
            try {
                if (!requireAdmin(request, reply)) return;

                const stats = await service.getAdminStats();
                return reply.code(200).send(stats);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // GET /v1/users/admin/users — Paginated user list for admin management
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/admin/users',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                querystring: z.object({
                    search: z.string().optional(),
                    limit: z.coerce.number().int().min(1).max(200).optional(),
                }),
            },
        },
        async (request, reply) => {
            try {
                if (!requireAdmin(request, reply)) return;

                const { search, limit } = request.query as { search?: string; limit?: number };
                const users = await service.getAdminUsers({ search, limit });
                return reply.code(200).send(users);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // POST /v1/users/admin/users/:id/ban — Toggle ban status for a user
    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/admin/users/:id/ban',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                params: z.object({ id: z.string() }),
            },
        },
        async (request, reply) => {
            try {
                if (!requireAdmin(request, reply)) return;

                const { id } = request.params as { id: string };
                const result = await service.toggleBanUser(id);
                return reply.code(200).send(result);
            } catch (err: any) {
                request.log.error(err);
                if (err.message === 'User not found') {
                    // Fixed literal — never echo err.message verbatim. Real error logged above.
                    return reply.code(404).send({ error: 'User not found' });
                }
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── Coach applications (apply → admin review → role promotion) ───────────

    // POST /v1/users/me/coach-application — apply (or re-apply) to become a coach
    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/me/coach-application',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: z.object({
                    bio: z.string().max(2000).optional(),
                    specializations: z.array(z.string().max(60)).max(20).optional(),
                    certifications: z.array(z.string().max(120)).max(20).optional(),
                    monthlyRateUsd: z.number().min(0).max(100000).nullish(),
                }),
            },
        },
        async (request, reply) => {
            try {
                const userId = extractUserId(request, reply);
                if (!userId) return;
                const result = await service.submitCoachApplication(userId, request.body as any);
                return reply.code(200).send(result);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // GET /v1/users/me/coach-application — my application status (or null)
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/me/coach-application',
        { onRequest: [(fastify as any).authenticate] },
        async (request, reply) => {
            try {
                const userId = extractUserId(request, reply);
                if (!userId) return;
                const app = await service.getMyCoachApplication(userId);
                return reply.code(200).send(app);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // GET /v1/users/admin/coach-applications?status=PENDING — admin review queue
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/admin/coach-applications',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                querystring: z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() }),
            },
        },
        async (request, reply) => {
            try {
                if (!requireAdmin(request, reply)) return;
                const { status } = request.query as { status?: string };
                const apps = await service.listCoachApplications(status);
                return reply.code(200).send(apps);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // POST /v1/users/admin/coach-applications/:id/approve — promote to COACH
    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/admin/coach-applications/:id/approve',
        {
            onRequest: [(fastify as any).authenticate],
            schema: { params: z.object({ id: z.string().uuid() }) },
        },
        async (request, reply) => {
            try {
                if (!requireAdmin(request, reply)) return;
                const adminId = extractUserId(request, reply);
                if (!adminId) return;
                const { id } = request.params as { id: string };
                const result = await service.approveCoachApplication(id, adminId);
                return reply.code(200).send(result);
            } catch (err: any) {
                request.log.error(err);
                if (err.statusCode === 404) return reply.code(404).send({ error: 'Application not found' });
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // POST /v1/users/admin/coach-applications/:id/reject — reject with a reason
    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/admin/coach-applications/:id/reject',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                params: z.object({ id: z.string().uuid() }),
                body: z.object({ reason: z.string().max(500).optional() }),
            },
        },
        async (request, reply) => {
            try {
                if (!requireAdmin(request, reply)) return;
                const adminId = extractUserId(request, reply);
                if (!adminId) return;
                const { id } = request.params as { id: string };
                const { reason } = request.body as { reason?: string };
                const result = await service.rejectCoachApplication(id, adminId, reason);
                return reply.code(200).send(result);
            } catch (err: any) {
                request.log.error(err);
                if (err.statusCode === 404) return reply.code(404).send({ error: 'Application not found' });
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── GET /v1/users/internal/profile/:userId ────────────────────────────────────
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/internal/profile/:userId',
        { preHandler: internalAuth },
        async (request, reply) => {
            try {
                const { userId } = request.params as { userId: string };
                const profile = await service.getProfileWithPreferences(userId);
                if (!profile) {
                    return reply.code(404).send({ error: 'Profile not found' });
                }
                return reply.code(200).send(profile);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── GET /v1/users/internal/preferences/:userId ────────────────────────────────
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/internal/preferences/:userId',
        { preHandler: internalAuth },
        async (request, reply) => {
            try {
                const { userId } = request.params as { userId: string };
                const pref = await service.getPreferences(userId);
                if (!pref) {
                    return reply.code(404).send({ error: 'Preferences not found' });
                }
                return reply.code(200).send(pref);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── GET /v1/users/internal/status/:userId ────────────────────────────────────
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/internal/status/:userId',
        { preHandler: internalAuth },
        async (request, reply) => {
            try {
                const { userId } = request.params as { userId: string };
                const status = await (service as any).getStatus(userId);
                if (!status) {
                    return reply.code(404).send({ error: 'Status not found' });
                }
                return reply.code(200).send(status);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── GET /v1/users/internal/all ────────────────────────────────────────────────
    // PERF (HIGH #3): CURSOR-PAGINATED. Accepts ?cursor=&limit= and returns
    // { users, nextCursor }. Callers (plan-service worker) page through batches
    // until nextCursor is null. Bounded per query instead of an unbounded
    // findMany over every profile. Internal-token guarded as before.
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/internal/all',
        {
            preHandler: internalAuth,
            schema: {
                querystring: z.object({
                    cursor: z.string().optional(),
                    limit: z.coerce.number().int().min(1).max(1000).optional(),
                }),
            },
        },
        async (request, reply) => {
            try {
                const { cursor, limit } = request.query as { cursor?: string; limit?: number };
                const page = await service.getAllUsersInternal({ cursor, limit });
                return reply.code(200).send(page);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );
};
