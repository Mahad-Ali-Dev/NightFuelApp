/**
 * Suite — auth-service `DELETE /v1/auth/internal/user/:userId` (src/routes.ts),
 * the server-to-server-only GDPR purge route.
 *
 * It PERMANENTLY deletes EVERY row this service owns for :userId across this
 * service's user-owned tables (verified against prisma/schema.prisma):
 *   - users                 (id)
 *   - refresh_tokens        (user_id)
 *   - password_reset_tokens (user_id)
 *
 * What this locks:
 *   1. NO X-Internal-Token   -> 404 (route hidden; service NEVER reached).
 *   2. WRONG X-Internal-Token-> 404 (service NEVER reached).
 *   3. CORRECT token         -> 200; the purge runs across all three tables and
 *                               returns a {deletedCounts per table} summary.
 *   4. IDEMPOTENT            -> a user with NO rows still returns 200 with all
 *                               counts 0 (the service uses deleteMany, which
 *                               never throws on zero matches).
 *
 * The 404 on missing/wrong token is deliberate (matches the nginx edge): a probe
 * can't tell a guarded internal route from a missing path.
 *
 * Prisma is mocked at the model level ($transaction + deleteMany) so the REAL
 * AuthService.purgeUserData logic is exercised end-to-end (transaction wiring,
 * per-table count mapping) with no DB. authRoutes is the genuine plugin mounted
 * on a fresh Fastify wired like src/index.ts.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { authRoutes } from '../src/routes';
import { AuthService } from '../src/auth.service';

const INTERNAL_TOKEN = 'auth-internal-token-value';
const USER_ID = '11111111-1111-1111-1111-111111111111';

// Minimal Prisma double: each model exposes deleteMany; $transaction resolves
// the array of operations (matching Prisma's interactive-array transaction
// contract) so the real purgeUserData runs against it.
function makeMockPrisma(counts: { refresh: number; reset: number; users: number }) {
    const refreshToken = { deleteMany: jest.fn(() => Promise.resolve({ count: counts.refresh })) };
    const passwordResetToken = { deleteMany: jest.fn(() => Promise.resolve({ count: counts.reset })) };
    const user = { deleteMany: jest.fn(() => Promise.resolve({ count: counts.users })) };
    const prisma: any = {
        refreshToken,
        passwordResetToken,
        user,
        // Resolve the array of pending operations, like Prisma's $transaction([...]).
        $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    return prisma;
}

function buildAuthService(prisma: any): AuthService {
    // eventBus + config are never touched by purgeUserData, so stubs suffice.
    return new AuthService(prisma, {} as any, { JWT_SECRET: 'x'.repeat(32) });
}

async function buildApp(authService: AuthService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    // authRoutes' logout/me routes reference `(fastify as any).authenticate`
    // (decorated by the JWT plugin in src/index.ts). Provide a no-op stub so
    // registration succeeds; the purge route under test uses the real internal-token
    // guard, not this decorator. Mirrors the other auth-service route suites.
    app.decorate('authenticate', async (request: any) => {
        request.user = { userId: '00000000-0000-0000-0000-000000000000' };
    });
    await app.register(
        async (instance) => {
            await authRoutes(instance, { authService, internalServiceToken: INTERNAL_TOKEN });
        },
        { prefix: '/v1/auth' }
    );
    await app.ready();
    return app;
}

describe('auth-service DELETE /v1/auth/internal/user/:userId — GDPR purge (internal-token guard)', () => {
    let app: FastifyInstance;
    let prisma: any;

    const url = `/v1/auth/internal/user/${USER_ID}`;

    afterEach(async () => {
        if (app) await app.close();
    });

    describe('guard', () => {
        beforeEach(async () => {
            prisma = makeMockPrisma({ refresh: 3, reset: 1, users: 1 });
            app = await buildApp(buildAuthService(prisma));
        });

        it('404s without an X-Internal-Token header (purge never runs)', async () => {
            const res = await app.inject({ method: 'DELETE', url });
            expect(res.statusCode).toBe(404);
            expect(prisma.$transaction).not.toHaveBeenCalled();
            expect(prisma.user.deleteMany).not.toHaveBeenCalled();
            expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
            expect(prisma.passwordResetToken.deleteMany).not.toHaveBeenCalled();
        });

        it('404s with a wrong X-Internal-Token (purge never runs)', async () => {
            const res = await app.inject({
                method: 'DELETE',
                url,
                headers: { 'x-internal-token': 'wrong-token' },
            });
            expect(res.statusCode).toBe(404);
            expect(prisma.$transaction).not.toHaveBeenCalled();
            expect(prisma.user.deleteMany).not.toHaveBeenCalled();
        });
    });

    describe('with the correct X-Internal-Token', () => {
        beforeEach(async () => {
            prisma = makeMockPrisma({ refresh: 3, reset: 1, users: 1 });
            app = await buildApp(buildAuthService(prisma));
        });

        it('purges the user across ALL of this service\'s tables and returns the per-table summary', async () => {
            const res = await app.inject({
                method: 'DELETE',
                url,
                headers: { 'x-internal-token': INTERNAL_TOKEN },
            });

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual({
                userId: USER_ID,
                deletedCounts: {
                    refresh_tokens: 3,
                    password_reset_tokens: 1,
                    users: 1,
                },
            });

            // Every user-owned table was targeted, scoped to THIS user only.
            expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
            expect(prisma.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
            expect(prisma.user.deleteMany).toHaveBeenCalledWith({ where: { id: USER_ID } });

            // Atomic: the deletes run inside a single transaction.
            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        });
    });

    describe('idempotency', () => {
        beforeEach(async () => {
            // User has NO rows anywhere — every deleteMany reports count 0.
            prisma = makeMockPrisma({ refresh: 0, reset: 0, users: 0 });
            app = await buildApp(buildAuthService(prisma));
        });

        it('returns 200 with all-zero counts when the user has no rows (and is safe to repeat)', async () => {
            const first = await app.inject({
                method: 'DELETE',
                url,
                headers: { 'x-internal-token': INTERNAL_TOKEN },
            });
            expect(first.statusCode).toBe(200);
            expect(first.json()).toEqual({
                userId: USER_ID,
                deletedCounts: { refresh_tokens: 0, password_reset_tokens: 0, users: 0 },
            });

            // Deleting again is safe — same 200, still all zeros, never throws.
            const second = await app.inject({
                method: 'DELETE',
                url,
                headers: { 'x-internal-token': INTERNAL_TOKEN },
            });
            expect(second.statusCode).toBe(200);
            expect(second.json()).toEqual({
                userId: USER_ID,
                deletedCounts: { refresh_tokens: 0, password_reset_tokens: 0, users: 0 },
            });
            expect(prisma.$transaction).toHaveBeenCalledTimes(2);
        });
    });
});
