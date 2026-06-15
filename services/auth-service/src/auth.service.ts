import { PrismaClient, User } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { RegisterBody, LoginBody, RefreshTokenBody, ForgotPasswordBody, ResetPasswordBody } from './schemas';
import bcrypt from 'bcryptjs';
import { Channels } from '@nightfuel/types';
import jwt from 'jsonwebtoken';
import { createLogger } from '@nightfuel/config';
import { randomUUID, randomBytes, createHash } from 'crypto';

// Generic message returned by forgot-password regardless of whether the account
// exists, to avoid leaking which emails are registered (user enumeration).
const FORGOT_PASSWORD_MESSAGE = 'If an account exists, a reset link has been sent';

// How long a password-reset token stays valid.
const RESET_TOKEN_TTL_MINUTES = 60;

// --- Login brute-force lockout (in-memory, per-process) ---------------------
// After too many consecutive failed logins for the same email within the
// window, further attempts are rejected for the remainder of the window. State
// is intentionally per-process and ephemeral (acceptable for a single-instance
// auth-service; resets on restart). A successful login clears the counter.
const MAX_LOGIN_FAILURES = 5;            // allow up to 5 failures, lock on the 6th
const LOGIN_LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const loginFailures = new Map<string, { count: number; firstFailureAt: number; until: number }>();

const logger = createLogger('auth-service:password-reset');

// Hash high-entropy tokens (refresh + password-reset) before they touch the DB.
// The raw token is what the client holds; we only ever persist/look up its
// SHA-256 digest, so a DB leak does not expose usable tokens. SHA-256 (no salt)
// is sufficient because these tokens are 256-bit random, not user-chosen.
function hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
}

export class AuthService {
    constructor(
        private prisma: PrismaClient,
        private eventBus: RedisEventBus,
        private config: { JWT_SECRET: string }
    ) { }

    async register(body: RegisterBody): Promise<{ user: User; accessToken: string; refreshToken: string }> {
        // Normalize the email so lookups and stored values are canonical
        // (case-insensitive, no surrounding whitespace). Matches the mobile
        // client and prevents case/whitespace-variant duplicate accounts.
        const email = body.email.trim().toLowerCase();

        const existingUser = await this.prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            throw new Error('User already exists');
        }

        const passwordHash = await bcrypt.hash(body.password, 12);

        const user = await this.prisma.user.create({
            data: {
                email,
                passwordHash,
                displayName: body.displayName,
                region: body.region,
                timezone: body.timezone ?? 'UTC',
                locale: body.locale ?? 'en-US',
                role: (body.role ?? 'USER') as any,
            },
        });

        // Publish user.registered — user-service subscribes to create UserProfile
        await this.eventBus.publish(Channels.Auth.UserRegistered, {
            eventId: randomUUID(),
            eventType: 'user.registered',
            producedAt: new Date().toISOString(),
            producerService: 'auth-service',
            correlationId: randomUUID(),
            userId: user.id,
            payload: {
                email: user.email,
                displayName: user.displayName,
                role: user.role,
                timezone: user.timezone,
                region: user.region,
            },
        });

        const { accessToken, refreshToken } = await this.generateTokens(user, body.deviceId);

        return { user, accessToken, refreshToken };
    }

    async login(body: LoginBody): Promise<{ user: User; accessToken: string; refreshToken: string }> {
        // Normalize the email so the lockout key and the user lookup use the
        // same canonical form (case-insensitive, no surrounding whitespace),
        // matching how register() stores it and how the mobile client sends it.
        const email = body.email.trim().toLowerCase();
        const lockoutKey = email;

        // Reject early if this account is currently locked out from too many
        // recent failures. Generic message (no enumeration: applies whether or
        // not the account exists).
        if (this.isLockedOut(lockoutKey)) {
            throw new Error('Account temporarily locked');
        }

        const user = await this.prisma.user.findUnique({
            where: { email },
        });

        if (!user) {
            this.recordLoginFailure(lockoutKey);
            throw new Error('Invalid credentials');
        }

        const validPassword = await bcrypt.compare(body.password, user.passwordHash);
        if (!validPassword) {
            this.recordLoginFailure(lockoutKey);
            throw new Error('Invalid credentials');
        }

        // Success — clear any accumulated failures for this account.
        this.clearLoginFailures(lockoutKey);

        const { accessToken, refreshToken } = await this.generateTokens(user, body.deviceId);

        return { user, accessToken, refreshToken };
    }

    /**
     * Returns true if the account currently has an active lockout. Expired
     * lockout/failure windows are lazily evicted here so the Map stays small.
     */
    private isLockedOut(key: string): boolean {
        const entry = loginFailures.get(key);
        if (!entry) return false;

        const now = Date.now();

        // Drop stale entries whose failure window has fully elapsed.
        if (now - entry.firstFailureAt > LOGIN_LOCKOUT_WINDOW_MS && now >= entry.until) {
            loginFailures.delete(key);
            return false;
        }

        return now < entry.until;
    }

    /**
     * Records a failed login for the account. Once consecutive failures exceed
     * MAX_LOGIN_FAILURES inside the window, the account is locked for the rest
     * of the window.
     */
    private recordLoginFailure(key: string): void {
        const now = Date.now();
        const existing = loginFailures.get(key);

        // Start a fresh window if there's no entry or the prior window elapsed.
        if (!existing || now - existing.firstFailureAt > LOGIN_LOCKOUT_WINDOW_MS) {
            loginFailures.set(key, { count: 1, firstFailureAt: now, until: 0 });
            return;
        }

        existing.count += 1;
        if (existing.count > MAX_LOGIN_FAILURES) {
            // Lock until the end of the current window.
            existing.until = existing.firstFailureAt + LOGIN_LOCKOUT_WINDOW_MS;
        }
        loginFailures.set(key, existing);
    }

    private clearLoginFailures(key: string): void {
        loginFailures.delete(key);
    }

    async refreshToken(body: RefreshTokenBody): Promise<{ accessToken: string; refreshToken: string }> {
        const { refreshToken } = body;

        // The client holds the raw token; we store only its hash, so look up by
        // the hash of what was presented.
        const savedToken = await this.prisma.refreshToken.findUnique({
            where: { tokenHash: hashToken(refreshToken) },
            include: { user: true },
        });

        if (!savedToken) {
            throw new Error('Invalid refresh token');
        }

        // Check if expired
        if (savedToken.expiresAt < new Date()) {
            // Delete expired token
            await this.prisma.refreshToken.delete({ where: { id: savedToken.id } });
            throw new Error('Refresh token expired');
        }

        // Rotate token: delete old one
        await this.prisma.refreshToken.delete({ where: { id: savedToken.id } });

        // Generate new tokens
        // Use the associated user to generate new tokens
        return this.generateTokens(savedToken.user, savedToken.deviceId);
    }

    async getUserProfile(userId: string): Promise<User | null> {
        return this.prisma.user.findUnique({
            where: { id: userId },
        });
    }

    async logout(refreshToken: string): Promise<void> {
        // Refresh tokens are stored hashed; match on the hash of the raw token.
        await this.prisma.refreshToken.deleteMany({
            where: { tokenHash: hashToken(refreshToken) },
        });
    }

    /**
     * Request a password reset. Always resolves with the same generic message
     * (never reveals whether the email exists) to prevent user enumeration.
     *
     * If the account exists, a cryptographically-random token is generated and
     * its SHA-256 hash is stored with a short TTL. The raw token is never
     * logged (it is a live credential); email delivery is wired separately, so
     * the raw token does not leave this method yet.
     */
    async forgotPassword(body: ForgotPasswordBody): Promise<{ message: string }> {
        const user = await this.prisma.user.findUnique({
            where: { email: body.email },
        });

        if (!user) {
            // Don't reveal non-existence; return the same response as the happy path.
            return { message: FORGOT_PASSWORD_MESSAGE };
        }

        // Invalidate any previously-issued, still-pending tokens for this user so
        // only the most recent reset link works.
        await this.prisma.passwordResetToken.deleteMany({
            where: { userId: user.id, usedAt: null },
        });

        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

        await this.prisma.passwordResetToken.create({
            data: {
                userId: user.id,
                tokenHash,
                expiresAt,
            },
        });

        // TODO(email): send an email containing the reset link (using rawToken).
        // The raw token is a live credential, so it is never written to logs —
        // log only a non-sensitive event for observability.
        logger.info(
            { userId: user.id },
            'Password reset token generated',
        );

        return { message: FORGOT_PASSWORD_MESSAGE };
    }

    /**
     * Complete a password reset. Validates the token (existence, not used, not
     * expired), sets the new bcrypt password hash, then invalidates the reset
     * token and revokes all of the user's refresh tokens (force re-login).
     *
     * Throws on an invalid or expired token so the route returns 400.
     */
    async resetPassword(body: ResetPasswordBody): Promise<void> {
        const tokenHash = hashToken(body.token);

        const resetToken = await this.prisma.passwordResetToken.findUnique({
            where: { tokenHash },
        });

        if (!resetToken || resetToken.usedAt !== null || resetToken.expiresAt < new Date()) {
            throw new Error('Invalid or expired reset token');
        }

        const passwordHash = await bcrypt.hash(body.newPassword, 12);

        // Atomically: update the password, mark the token used, and revoke all
        // existing refresh tokens so old sessions can no longer be refreshed.
        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: resetToken.userId },
                data: { passwordHash },
            }),
            this.prisma.passwordResetToken.update({
                where: { id: resetToken.id },
                data: { usedAt: new Date() },
            }),
            this.prisma.refreshToken.deleteMany({
                where: { userId: resetToken.userId },
            }),
        ]);

        logger.info({ userId: resetToken.userId }, 'Password reset completed');
    }

    private async generateTokens(user: User, deviceId: string) {
        const accessToken = jwt.sign(
            { userId: user.id, role: user.role },
            this.config.JWT_SECRET,
            { expiresIn: '30m' }
        );

        // The raw refresh token is returned to the client; only its SHA-256
        // hash is persisted, so a DB compromise never yields a usable token.
        // Use 256 bits of entropy (matching the password-reset token) rather
        // than a UUIDv4, whose format is predictable and carries fewer bits.
        const refreshTokenString = randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

        await this.prisma.refreshToken.create({
            data: {
                userId: user.id,
                tokenHash: hashToken(refreshTokenString),
                deviceId,
                expiresAt,
            },
        });

        return { accessToken, refreshToken: refreshTokenString };
    }
}
