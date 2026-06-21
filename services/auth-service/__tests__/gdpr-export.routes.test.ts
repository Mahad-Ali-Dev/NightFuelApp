/**
 * Suite — auth-service `GET /v1/auth/internal/user/:userId/export` (src/routes.ts),
 * the server-to-server-only GDPR data-export (Right of Access, Art. 15) route.
 *
 * It READS and returns EVERY row this service owns for :userId across the SAME
 * tables the purge covers (mirrors purgeUserData EXACTLY so export and erasure
 * stay in sync), keyed by table name:
 *   - users                 (id)
 *   - refresh_tokens        (user_id)
 *   - password_reset_tokens (user_id)
 *
 * What this locks:
 *   1. NO X-Internal-Token   -> 404 (route hidden; service NEVER reached).
 *   2. WRONG X-Internal-Token-> 404 (service NEVER reached).
 *   3. CORRECT token         -> 200; export runs across all three tables and
 *                               returns the user's data keyed by table name.
 *   4. SECURITY               -> NO secret column (users.password_hash,
 *                               refresh_tokens.token_hash,
 *                               password_reset_tokens.token_hash) appears
 *                               ANYWHERE in the output.
 *
 * The 404 on missing/wrong token is deliberate (matches the nginx edge): a probe
 * can't tell a guarded internal route from a missing path.
 *
 * Prisma is mocked at the model level (findUnique/findMany + $transaction) so the
 * REAL AuthService.exportUserData logic is exercised end-to-end (select
 * allowlists, table-keyed shape) with no DB. authRoutes is the genuine plugin
 * mounted on a fresh Fastify wired like src/index.ts.
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { authRoutes } from '../src/routes';
import { AuthService } from '../src/auth.service';

const INTERNAL_TOKEN = 'auth-internal-token-value';
const USER_ID = '11111111-1111-1111-1111-111111111111';

// Sentinel secret values — if any of these ever appears in the response body the
// security assertion fails. They are returned by the mock ONLY when the real
// service forgets to use a select-allowlist; the real service must never select
// these columns, so the mock returns the allowlisted shape only.
const PASSWORD_HASH = '$2a$12$THIS_IS_A_SECRET_BCRYPT_HASH_DO_NOT_LEAK';
const REFRESH_TOKEN_HASH = 'refresh-token-sha256-secret-DO-NOT-LEAK';
const RESET_TOKEN_HASH = 'reset-token-sha256-secret-DO-NOT-LEAK';

// Minimal Prisma double honouring Prisma's `select` contract: each finder
// returns ONLY the columns the caller asked for (via `select`). This proves the
// real exportUserData uses an allowlist — if it forgot `select`, the mock would
// fall back to the full row (including the *_hash secrets) and the security
// assertion below would catch the leak.
function applySelect(row: any, args: any) {
    if (!row) return row;
    if (!args?.select) return row; // no allowlist -> full row (would leak secrets)
    const out: any = {};
    for (const k of Object.keys(args.select)) {
        if (args.select[k]) out[k] = row[k];
    }
    return out;
}

function makeMockPrisma(opts: { userExists: boolean; refreshCount: number; resetCount: number }) {
    const fullUser = {
        id: USER_ID,
        email: 'person@example.com',
        passwordHash: PASSWORD_HASH, // SECRET — must never be selected/returned
        displayName: 'Person',
        avatarUrl: null,
        timezone: 'UTC',
        locale: 'en-US',
        region: 'US',
        role: 'USER',
        onboardingCompleted: true,
        emailVerified: true,
        createdAt: new Date('2025-01-01T00:00:00.000Z'),
        updatedAt: new Date('2025-02-01T00:00:00.000Z'),
    };

    const fullRefreshTokens = Array.from({ length: opts.refreshCount }).map((_, i) => ({
        id: `refresh-${i}`,
        userId: USER_ID,
        tokenHash: REFRESH_TOKEN_HASH, // SECRET — must never be selected/returned
        deviceId: `device-${i}`,
        expiresAt: new Date('2025-03-01T00:00:00.000Z'),
        createdAt: new Date('2025-01-02T00:00:00.000Z'),
    }));

    const fullResetTokens = Array.from({ length: opts.resetCount }).map((_, i) => ({
        id: `reset-${i}`,
        userId: USER_ID,
        tokenHash: RESET_TOKEN_HASH, // SECRET — must never be selected/returned
        expiresAt: new Date('2025-03-01T00:00:00.000Z'),
        usedAt: null,
        createdAt: new Date('2025-01-03T00:00:00.000Z'),
    }));

    const user = {
        findUnique: jest.fn((args: any) =>
            Promise.resolve(opts.userExists ? applySelect(fullUser, args) : null)
        ),
        deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
    };
    const refreshToken = {
        findMany: jest.fn((args: any) =>
            Promise.resolve(fullRefreshTokens.map((r) => applySelect(r, args)))
        ),
        deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
    };
    const passwordResetToken = {
        findMany: jest.fn((args: any) =>
            Promise.resolve(fullResetTokens.map((r) => applySelect(r, args)))
        ),
        deleteMany: jest.fn(() => Promise.resolve({ count: 0 })),
    };

    const prisma: any = {
        user,
        refreshToken,
        passwordResetToken,
        $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
    };
    return prisma;
}

function buildAuthService(prisma: any): AuthService {
    return new AuthService(prisma, {} as any, { JWT_SECRET: 'x'.repeat(32) });
}

async function buildApp(authService: AuthService): Promise<FastifyInstance> {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
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

describe('auth-service GET /v1/auth/internal/user/:userId/export — GDPR export (internal-token guard)', () => {
    let app: FastifyInstance;
    let prisma: any;

    const url = `/v1/auth/internal/user/${USER_ID}/export`;

    afterEach(async () => {
        if (app) await app.close();
    });

    describe('guard', () => {
        beforeEach(async () => {
            prisma = makeMockPrisma({ userExists: true, refreshCount: 2, resetCount: 1 });
            app = await buildApp(buildAuthService(prisma));
        });

        it('404s without an X-Internal-Token header (export never runs)', async () => {
            const res = await app.inject({ method: 'GET', url });
            expect(res.statusCode).toBe(404);
            expect(prisma.$transaction).not.toHaveBeenCalled();
            expect(prisma.user.findUnique).not.toHaveBeenCalled();
            expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
            expect(prisma.passwordResetToken.findMany).not.toHaveBeenCalled();
        });

        it('404s with a wrong X-Internal-Token (export never runs)', async () => {
            const res = await app.inject({
                method: 'GET',
                url,
                headers: { 'x-internal-token': 'wrong-token' },
            });
            expect(res.statusCode).toBe(404);
            expect(prisma.$transaction).not.toHaveBeenCalled();
            expect(prisma.user.findUnique).not.toHaveBeenCalled();
        });
    });

    describe('with the correct X-Internal-Token', () => {
        beforeEach(async () => {
            prisma = makeMockPrisma({ userExists: true, refreshCount: 2, resetCount: 1 });
            app = await buildApp(buildAuthService(prisma));
        });

        it('returns the user\'s data across ALL of this service\'s tables, keyed by table name', async () => {
            const res = await app.inject({
                method: 'GET',
                url,
                headers: { 'x-internal-token': INTERNAL_TOKEN },
            });

            expect(res.statusCode).toBe(200);
            const body = res.json();

            expect(body.userId).toBe(USER_ID);
            // Mirrors the purge's table set EXACTLY.
            expect(Object.keys(body.data).sort()).toEqual(
                ['password_reset_tokens', 'refresh_tokens', 'users'].sort()
            );

            // users — non-secret metadata present.
            expect(body.data.users.id).toBe(USER_ID);
            expect(body.data.users.email).toBe('person@example.com');
            expect(body.data.users).not.toHaveProperty('passwordHash');

            // refresh_tokens — every owned row, metadata only.
            expect(body.data.refresh_tokens).toHaveLength(2);
            expect(body.data.refresh_tokens[0]).not.toHaveProperty('tokenHash');
            expect(body.data.refresh_tokens[0].deviceId).toBe('device-0');

            // password_reset_tokens — every owned row, metadata only.
            expect(body.data.password_reset_tokens).toHaveLength(1);
            expect(body.data.password_reset_tokens[0]).not.toHaveProperty('tokenHash');

            // Read-only: NO write/delete touched any table.
            expect(prisma.user.deleteMany).not.toHaveBeenCalled();
            expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
            expect(prisma.passwordResetToken.deleteMany).not.toHaveBeenCalled();

            // Scoped to THIS user only.
            expect(prisma.user.findUnique).toHaveBeenCalledWith(
                expect.objectContaining({ where: { id: USER_ID } })
            );
            expect(prisma.refreshToken.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { userId: USER_ID } })
            );
            expect(prisma.passwordResetToken.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { userId: USER_ID } })
            );
        });

        it('SECURITY: NO password/token hash appears anywhere in the output', async () => {
            const res = await app.inject({
                method: 'GET',
                url,
                headers: { 'x-internal-token': INTERNAL_TOKEN },
            });
            expect(res.statusCode).toBe(200);

            // Scan the raw serialized body — a leak in ANY nested field is caught.
            const raw = res.body;
            expect(raw).not.toContain(PASSWORD_HASH);
            expect(raw).not.toContain(REFRESH_TOKEN_HASH);
            expect(raw).not.toContain(RESET_TOKEN_HASH);
            // Belt-and-braces: the secret column names never surface either.
            expect(raw).not.toContain('passwordHash');
            expect(raw).not.toContain('password_hash');
            expect(raw).not.toContain('tokenHash');
            expect(raw).not.toContain('token_hash');
        });
    });

    describe('idempotent / no rows', () => {
        beforeEach(async () => {
            // User does not exist and has no child rows anywhere.
            prisma = makeMockPrisma({ userExists: false, refreshCount: 0, resetCount: 0 });
            app = await buildApp(buildAuthService(prisma));
        });

        it('returns 200 with users:null and empty arrays (and is safe to repeat)', async () => {
            const first = await app.inject({
                method: 'GET',
                url,
                headers: { 'x-internal-token': INTERNAL_TOKEN },
            });
            expect(first.statusCode).toBe(200);
            expect(first.json()).toEqual({
                userId: USER_ID,
                data: { users: null, refresh_tokens: [], password_reset_tokens: [] },
            });

            // Repeat call is identical (read-only, idempotent).
            const second = await app.inject({
                method: 'GET',
                url,
                headers: { 'x-internal-token': INTERNAL_TOKEN },
            });
            expect(second.statusCode).toBe(200);
            expect(second.json()).toEqual(first.json());
        });
    });
});
