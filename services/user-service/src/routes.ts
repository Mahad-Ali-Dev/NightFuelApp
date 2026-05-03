
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
    updateProfileSchema,
    updatePreferencesSchema,
    updateOnboardingSchema,
} from './schemas';
import { z } from 'zod';
import { UserService } from './user.service';

// ── Shared userId extractor ───────────────────────────────────────────────────
// auth-service signs JWTs with { userId, role }. @fastify/jwt attaches the
// decoded payload as request.user, so we read .userId (primary) or .id (legacy).
function extractUserId(request: FastifyRequest, reply: FastifyReply): string | null {
    const user = request.user as any;
    const userId: string | undefined = user?.userId ?? user?.id;
    if (!userId || typeof userId !== 'string') {
        reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Token payload is missing userId.',
        });
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
    opts: { userService: UserService }
): Promise<void> => {
    const service = opts.userService;

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
                // Using internal profile fetcher as it gets the basic data
                const profile = await service.getProfileWithPreferences(userId);
                if (!profile) {
                    return reply.code(404).send({ error: 'Profile not found' });
                }

                // Strip sensitive data before sending
                return reply.code(200).send({
                    id: profile.userId,
                    displayName: profile.displayName,
                    avatarUrl: profile.avatarUrl,
                    timezone: profile.timezone
                });
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

                // DEBUG (remove later)
                console.log('UPDATE PROFILE BODY:', request.body);

                const profile = await service.updateProfile(userId, request.body);
                return reply.code(200).send(profile);
            } catch (err: any) {
                request.log.error(err);
                console.error('PUT /me ERROR:', err); // ← IMPORTANT

                if (err.message === 'Profile not found') {
                    return reply.code(404).send({ error: err.message });
                }

                // Return actual error during dev (instead of hiding it)
                return reply.code(500).send({
                    error: err.message || 'Internal server error',
                });
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
                if (err.message.includes('not found')) {
                    return reply.code(404).send({ error: err.message });
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
                    return reply.code(404).send({ error: err.message });
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
                const status = err.message.includes('Unauthorized') ? 403 : 500;
                return reply.code(status).send({ error: err.message });
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
                    return reply.code(404).send({ error: err.message });
                }
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );

    // ── GET /v1/users/internal/profile/:userId ────────────────────────────────────
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/internal/profile/:userId',
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
    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/internal/all',
        async (request, reply) => {
            try {
                const users = await service.getAllUsersInternal();
                return reply.code(200).send(users);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    );
};
