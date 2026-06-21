
import { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { makeInternalAuthGuard } from '@nightfuel/config';
import { registerSchema, loginSchema, refreshTokenSchema, forgotPasswordSchema, resetPasswordSchema } from './schemas';
import { AuthService } from './auth.service';

export const authRoutes: FastifyPluginAsync<{ authService: AuthService; internalServiceToken?: string }> = async (fastify, opts) => {
    const service = opts.authService;

    // F34 #5 / F35a: guard the server-to-server-only /internal/* route with the
    // shared constant-time X-Internal-Token check (makeInternalAuthGuard). On a
    // missing/wrong token it 404s (matches the nginx edge), so a probe cannot
    // tell a guarded internal route from a missing path. The token is wired in
    // from config (INTERNAL_SERVICE_TOKEN) in index.ts; when empty the guard
    // fails closed and every /internal request 404s.
    const internalAuth = makeInternalAuthGuard(opts.internalServiceToken);

    // Allowlist of the exact user-facing strings AuthService is known to throw.
    // Any other error (DB/Prisma/network/etc.) is an unexpected internal failure
    // and must NOT be reflected to the client verbatim — it gets the per-route
    // generic fallback instead, while the real error is still logged server-side.
    // NOTE: 'User already exists' is deliberately NOT allowlisted. register()
    // no longer throws it (it returns the same generic message for new and
    // duplicate emails to prevent account enumeration); were it ever thrown
    // again it must collapse to the generic fallback, never reach the client.
    const ALLOWED = new Set<string>([
        'Account temporarily locked',
        'Invalid credentials',
        'Invalid refresh token',
        'Refresh token expired',
        'Invalid or expired reset token',
    ]);
    const safeMsg = (err: any, fallback: string) =>
        typeof err?.message === 'string' && ALLOWED.has(err.message) ? err.message : fallback;

    // Tight per-route rate limit for the credential-handling endpoints. The
    // @fastify/rate-limit plugin (registered globally in index.ts) reads this
    // route config and automatically replies 429 + Retry-After once exceeded.
    // Key on IP + email (when the body carries one) so a single attacker IP
    // can't churn through many accounts and a single account can't be hammered
    // from one host, while still allowing legitimate distinct users to proceed.
    const authRateLimit = {
        rateLimit: {
            max: 7,
            timeWindow: '1 minute',
            keyGenerator: (request: any) => {
                const email =
                    request.body && typeof request.body.email === 'string'
                        ? request.body.email.toLowerCase()
                        : '';
                return `${request.ip}:${email}`;
            },
        },
    };

    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/register',
        {
            config: authRateLimit,
            schema: {
                body: registerSchema,
            },
        },
        async (request, reply) => {
            // Always reply 200 with the same generic message — never reveal
            // whether the email is already registered (account enumeration).
            // On an internal failure, still surface the identical generic body
            // (logged server-side) so the duplicate/new/error cases are all
            // indistinguishable, mirroring the forgot-password handler below.
            const GENERIC_REGISTER_MESSAGE =
                "If this email isn't already registered, the account was created";
            try {
                const result = await service.register(request.body);
                reply.send(result);
            } catch (err: any) {
                request.log.error(err);
                reply.send({ message: GENERIC_REGISTER_MESSAGE });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/login',
        {
            config: authRateLimit,
            schema: {
                body: loginSchema,
            },
        },
        async (request, reply) => {
            try {
                const result = await service.login(request.body);
                // Defence-in-depth: the service already strips passwordHash, but
                // redact it again at the edge so the bcrypt hash can never reach
                // the client even if a future change reintroduces it on the user
                // object (mirrors the /me route's passwordHash exclusion).
                const { passwordHash, ...safeUser } = (result.user ?? {}) as any;
                reply.send({ ...result, user: safeUser });
            } catch (err: any) {
                request.log.error(err);
                reply.code(401).send({ error: safeMsg(err, 'Invalid credentials') });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/refresh',
        {
            config: authRateLimit,
            schema: {
                body: refreshTokenSchema,
            },
        },
        async (request, reply) => {
            try {
                const result = await service.refreshToken(request.body);
                reply.send(result);
            } catch (err: any) {
                request.log.error(err);
                reply.code(401).send({ error: safeMsg(err, 'Invalid refresh token') });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/forgot-password',
        {
            config: authRateLimit,
            schema: {
                body: forgotPasswordSchema,
            },
        },
        async (request, reply) => {
            // Always return 200 with a generic message — never reveal whether the
            // account exists (prevents user enumeration). Internal failures are
            // logged but still surface the generic message.
            try {
                const result = await service.forgotPassword(request.body);
                reply.send(result);
            } catch (err: any) {
                request.log.error(err);
                reply.send({ message: 'If an account exists, a reset link has been sent' });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/reset-password',
        {
            config: authRateLimit,
            schema: {
                body: resetPasswordSchema,
            },
        },
        async (request, reply) => {
            try {
                await service.resetPassword(request.body);
                reply.send({ message: 'Password has been reset' });
            } catch (err: any) {
                request.log.error(err);
                reply.code(400).send({ error: safeMsg(err, 'Unable to reset password') });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().post(
        '/logout',
        {
            onRequest: [(fastify as any).authenticate],
            schema: {
                body: refreshTokenSchema,
            },
        },
        async (request, reply) => {
            try {
                await service.logout(request.body.refreshToken);
                reply.code(204).send();
            } catch (err: any) {
                request.log.error(err);
                // Route through the allowlist helper: only a known user-facing
                // string (e.g. 'Invalid refresh token') may surface verbatim; any
                // other error (DB/Prisma/network) is replaced by the fixed
                // fallback so internal detail never leaks. Real error logged above.
                reply.code(400).send({ error: safeMsg(err, 'Unable to complete request') });
            }
        }
    );

    fastify.withTypeProvider<ZodTypeProvider>().get(
        '/me',
        {
            onRequest: [(fastify as any).authenticate],
        },
        async (request, reply) => {
            // @ts-ignore
            const userId = request.user.userId;
            const user = await service.getUserProfile(userId);
            if (!user) {
                reply.code(404).send({ error: 'User not found' });
                return;
            }
            // Exclude password hash
            const { passwordHash, ...profile } = user;
            return profile;
        }
    );

    // ── DELETE /v1/auth/internal/user/:userId ────────────────────────────────
    // GDPR purge — server-to-server only (guarded by the X-Internal-Token check
    // above). PERMANENTLY deletes EVERY row this service owns for :userId across
    // users, refresh_tokens and password_reset_tokens.
    //
    // IDEMPOTENT: the service layer uses deleteMany (no throw on zero rows), so
    // purging a user with no rows still returns 200 with all counts 0, and
    // calling it twice is safe (the second call simply reports 0s). Returns a
    // small {deletedCounts per table} summary.
    fastify.withTypeProvider<ZodTypeProvider>().delete(
        '/internal/user/:userId',
        {
            preHandler: internalAuth,
            schema: {
                params: z.object({ userId: z.string().uuid() }),
            },
        },
        async (request, reply) => {
            try {
                const { userId } = request.params;
                const result = await service.purgeUserData(userId);
                return reply.code(200).send(result);
            } catch (err: any) {
                request.log.error(err);
                return reply.code(500).send({ error: 'An unexpected error occurred' });
            }
        }
    );
};
