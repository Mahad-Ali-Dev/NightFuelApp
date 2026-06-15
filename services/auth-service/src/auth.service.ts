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

const logger = createLogger('auth-service:password-reset');

export class AuthService {
    constructor(
        private prisma: PrismaClient,
        private eventBus: RedisEventBus,
        private config: { JWT_SECRET: string }
    ) { }

    async register(body: RegisterBody): Promise<{ user: User; accessToken: string; refreshToken: string }> {
        const existingUser = await this.prisma.user.findUnique({
            where: { email: body.email },
        });

        if (existingUser) {
            throw new Error('User already exists');
        }

        const passwordHash = await bcrypt.hash(body.password, 12);

        const user = await this.prisma.user.create({
            data: {
                email: body.email,
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
        const user = await this.prisma.user.findUnique({
            where: { email: body.email },
        });

        if (!user) {
            throw new Error('Invalid credentials');
        }

        const validPassword = await bcrypt.compare(body.password, user.passwordHash);
        if (!validPassword) {
            throw new Error('Invalid credentials');
        }

        const { accessToken, refreshToken } = await this.generateTokens(user, body.deviceId);

        return { user, accessToken, refreshToken };
    }

    async refreshToken(body: RefreshTokenBody): Promise<{ accessToken: string; refreshToken: string }> {
        const { refreshToken } = body;

        // Find token in DB
        const savedToken = await this.prisma.refreshToken.findUnique({
            where: { tokenHash: refreshToken },
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
        await this.prisma.refreshToken.deleteMany({
            where: { tokenHash: refreshToken },
        });
    }

    /**
     * Request a password reset. Always resolves with the same generic message
     * (never reveals whether the email exists) to prevent user enumeration.
     *
     * If the account exists, a cryptographically-random token is generated, its
     * SHA-256 hash is stored with a short TTL, and the raw token is logged at
     * info level. Email delivery is wired separately — the raw token never
     * leaves this method otherwise.
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
        const tokenHash = this.hashResetToken(rawToken);
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

        await this.prisma.passwordResetToken.create({
            data: {
                userId: user.id,
                tokenHash,
                expiresAt,
            },
        });

        // TODO(email): replace this log with an email containing the reset link.
        logger.info(
            { userId: user.id, resetToken: rawToken, expiresAt: expiresAt.toISOString() },
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
        const tokenHash = this.hashResetToken(body.token);

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

    // Reset tokens are stored hashed (never in plaintext), mirroring how we
    // look up refresh tokens. SHA-256 is sufficient here since the raw token is
    // already high-entropy (256 bits) and not user-chosen.
    private hashResetToken(rawToken: string): string {
        return createHash('sha256').update(rawToken).digest('hex');
    }

    private async generateTokens(user: User, deviceId: string) {
        const accessToken = jwt.sign(
            { userId: user.id, role: user.role },
            this.config.JWT_SECRET,
            { expiresIn: '24h' }
        );

        const refreshTokenString = randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

        await this.prisma.refreshToken.create({
            data: {
                userId: user.id,
                tokenHash: refreshTokenString, // In prod, hash this too!
                deviceId,
                expiresAt,
            },
        });

        return { accessToken, refreshToken: refreshTokenString };
    }
}
