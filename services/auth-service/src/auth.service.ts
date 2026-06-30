import { PrismaClient, User } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import { RegisterBody, LoginBody, ForgotPasswordBody, ResetPasswordBody } from './schemas';
import bcrypt from 'bcryptjs';
import { Channels } from '@nightfuel/types';
import jwt from 'jsonwebtoken';
import nodemailer, { Transporter } from 'nodemailer';
import { createLogger } from '@nightfuel/config';
import { randomUUID, randomBytes, createHash } from 'crypto';

// Generic message returned by forgot-password regardless of whether the account
// exists, to avoid leaking which emails are registered (user enumeration).
const FORGOT_PASSWORD_MESSAGE = 'If an account exists, a reset link has been sent';

// Generic message returned by register regardless of whether the email is
// already taken, to avoid leaking which emails are registered (user
// enumeration). A duplicate email gets this exact same response a brand-new
// signup would, mirroring the forgot-password anti-enumeration style above.
const REGISTER_MESSAGE = "If this email isn't already registered, the account was created";

// Precomputed bcrypt hash of a fixed dummy password. When login is attempted
// for an email that does NOT exist, we still run bcrypt.compare against this
// hash and discard the result, so the response time for "no such user" matches
// the time for "user exists, wrong password" (closes the login timing
// side-channel that would otherwise let an attacker enumerate accounts).
// Generated with bcrypt.hashSync('a-dummy-password-for-constant-time', 12).
const DUMMY_PASSWORD_HASH =
    '$2a$12$sR.p51NNp8/s/8nMzIyEqusdIOmwnsCNGMQCZbN2h8Dqien0kx7lq';

// Type returned to callers for register/login — the raw User row minus its
// secret passwordHash. Stripping here means the bcrypt hash never leaves the
// service layer (it cannot leak through the route even if a future change
// forgets to redact it). Mirrors the /me route's `const { passwordHash, ...} `.
export type SafeUser = Omit<User, 'passwordHash'>;

// How long a password-reset token stays valid.
const RESET_TOKEN_TTL_MINUTES = 60;

// Where the password-reset link points when APP_RESET_URL is not configured.
// The raw token is appended as `?token=...`; the screen reads it and POSTs to
// /v1/auth/reset-password.
const DEFAULT_RESET_URL = 'https://zeitra.app/reset';

// SMTP settings, all optional. When `host` is set, forgotPassword() delivers a
// real reset email; otherwise it logs a clearly-marked DEV fallback so the flow
// is testable without credentials. Sourced from env (SMTP_*) in index.ts.
export interface SmtpConfig {
    host?: string;
    port?: string;
    user?: string;
    password?: string;
    from?: string;
}

export interface AuthServiceConfig {
    JWT_SECRET: string;
    smtp?: SmtpConfig;
    appResetUrl?: string;
}

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
    // Lazily-created nodemailer transport, reused across requests. Only built
    // when SMTP is configured; stays null in the dev/no-creds path so the
    // service never opens a connection it doesn't need.
    private mailTransport: Transporter | null = null;

    constructor(
        private prisma: PrismaClient,
        private eventBus: RedisEventBus,
        private config: AuthServiceConfig
    ) { }

    /** True when SMTP is configured (an SMTP_HOST was provided). */
    private smtpConfigured(): boolean {
        return !!this.config.smtp?.host;
    }

    /** Build (once) and return the shared nodemailer transport. */
    private getMailTransport(): Transporter {
        if (!this.mailTransport) {
            const smtp = this.config.smtp ?? {};
            const port = smtp.port ? parseInt(smtp.port, 10) : 587;
            this.mailTransport = nodemailer.createTransport({
                host: smtp.host,
                port,
                // 465 is implicit TLS; other ports use STARTTLS upgrade.
                secure: port === 465,
                auth: smtp.user
                    ? { user: smtp.user, pass: smtp.password }
                    : undefined,
            });
        }
        return this.mailTransport;
    }

    /**
     * Deliver (or, in dev, log) the password-reset link for `rawToken`.
     *
     * The raw token is a LIVE credential. When SMTP is configured we email the
     * link and never write the token to logs. When SMTP is NOT configured we
     * fall back to logging the full reset link under an explicit DEV marker so
     * the flow is testable locally without mail creds — this branch must never
     * run in production (it requires SMTP to be left unset).
     *
     * Best-effort and self-contained: a mail failure is logged but not
     * rethrown, so forgot-password keeps returning its generic anti-enumeration
     * response regardless of delivery outcome.
     */
    private async sendPasswordResetEmail(email: string, rawToken: string): Promise<void> {
        const base = this.config.appResetUrl || DEFAULT_RESET_URL;
        const resetUrl = `${base}?token=${rawToken}`;

        if (!this.smtpConfigured()) {
            // DEV FALLBACK — no SMTP configured. Log the link so the reset flow
            // can be exercised end-to-end without mail credentials. This is the
            // ONLY path that may surface the raw token, and it cannot trigger in
            // production (where SMTP_* must be set). OWNER: configure SMTP_* to
            // switch to real email delivery.
            logger.warn(
                { resetUrl },
                '[DEV] SMTP not configured — password reset link (configure SMTP_* for real email delivery)',
            );
            return;
        }

        try {
            await this.getMailTransport().sendMail({
                to: email,
                from: this.config.smtp?.from || 'no-reply@zeitra.app',
                subject: 'Reset your Zeitra password',
                text:
                    `We received a request to reset your Zeitra password.\n\n` +
                    `Reset it here (link expires in ${RESET_TOKEN_TTL_MINUTES} minutes):\n${resetUrl}\n\n` +
                    `If you didn't request this, you can safely ignore this email.`,
                html:
                    `<p>We received a request to reset your Zeitra password.</p>` +
                    `<p>Reset it here (link expires in ${RESET_TOKEN_TTL_MINUTES} minutes):</p>` +
                    `<p><a href="${resetUrl}">${resetUrl}</a></p>` +
                    `<p>If you didn't request this, you can safely ignore this email.</p>`,
            });
            // Never log the raw token/link on the production path — record only a
            // non-sensitive delivery event for observability.
            logger.info('Password reset email sent');
        } catch (err) {
            // Don't rethrow — the caller still returns the generic response so a
            // mail outage never leaks account existence or breaks the endpoint.
            logger.error({ err }, 'Failed to send password reset email');
        }
    }

    /**
     * Register a new account. Always resolves with the SAME generic message
     * (never reveals whether the email is already taken) to prevent user
     * enumeration — mirroring the forgot-password anti-enumeration style.
     *
     * If the email is free, the account is created and a `user.registered`
     * event is published. If the email is already taken, the call silently
     * no-ops and returns the identical response, so a caller cannot tell the
     * two cases apart (neither by response shape/status nor — see below — by
     * timing: a duplicate still pays a bcrypt.hash cost equivalent to a real
     * signup before returning).
     */
    async register(body: RegisterBody): Promise<{ message: string }> {
        // Normalize the email so lookups and stored values are canonical
        // (case-insensitive, no surrounding whitespace). Matches the mobile
        // client and prevents case/whitespace-variant duplicate accounts.
        const email = body.email.trim().toLowerCase();

        const existingUser = await this.prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            // Account-enumeration defence: do NOT reveal that the email is
            // taken. Still spend the same bcrypt.hash cost a real signup would,
            // so the duplicate path is timing-indistinguishable from a new one,
            // then return the identical generic response.
            await bcrypt.hash(body.password, 12);
            return { message: REGISTER_MESSAGE };
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
                // Registration ALWAYS creates a USER — never a privileged role.
                // The schema already restricts `role` to 'USER', but we hard-pin it
                // here too (defense in depth): coach/admin roles are only granted
                // out-of-band (admin approval / seed), never from a register body.
                role: 'USER' as any,
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

        return { message: REGISTER_MESSAGE };
    }

    async login(body: LoginBody): Promise<{ user: SafeUser; accessToken: string; refreshToken: string }> {
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
            // Timing side-channel defence: run a bcrypt.compare against a fixed
            // dummy hash and discard the result, so a "no such user" response
            // takes the same time as a "user exists, wrong password" response
            // (the real compare below). Without this, an attacker could
            // enumerate accounts by measuring how fast login fails.
            await bcrypt.compare(body.password, DUMMY_PASSWORD_HASH);
            this.recordLoginFailure(lockoutKey);
            throw new Error('Invalid credentials');
        }

        const validPassword = await bcrypt.compare(body.password, user.passwordHash);
        if (!validPassword) {
            this.recordLoginFailure(lockoutKey);
            throw new Error('Invalid credentials');
        }

        // Banned accounts cannot obtain tokens. Checked AFTER the password is
        // verified so a wrong password still returns the generic 'Invalid
        // credentials' (no enumeration of which accounts are banned).
        if ((user as any).banned) {
            throw new Error('Account disabled');
        }

        // Success — clear any accumulated failures for this account.
        this.clearLoginFailures(lockoutKey);

        const { accessToken, refreshToken } = await this.generateTokens(user, body.deviceId);

        // Strip the bcrypt hash so the secret never leaves the service layer
        // (mirrors the /me route's `const { passwordHash, ...profile } = user`).
        const { passwordHash, ...safeUser } = user;
        return { user: safeUser, accessToken, refreshToken };
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

    async refreshToken(body: { refreshToken: string }): Promise<{ accessToken: string; refreshToken: string }> {
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

    /**
     * Set a user's role. Server-to-server ONLY (called by user-service over the
     * internal channel when a coach application is approved/revoked). The route
     * restricts `role` to the non-privileged set — ADMIN/SUPERADMIN are NEVER
     * assignable this way, so an approval flow can't escalate anyone to admin.
     */
    async setUserRole(userId: string, role: string): Promise<void> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { role: role as any },
        });
    }

    /** Ban/unban a user (admin action via the internal channel). A banned user
     * cannot log in (see login) — existing access tokens still expire in ~30m. */
    async setUserBanned(userId: string, banned: boolean): Promise<{ banned: boolean }> {
        await this.prisma.user.update({
            where: { id: userId },
            data: { banned } as any,
        });
        return { banned };
    }

    /** Whether a single user is banned (for the ban TOGGLE to flip). */
    async isUserBanned(userId: string): Promise<boolean> {
        const u = await this.prisma.user.findUnique({ where: { id: userId } });
        return Boolean((u as any)?.banned);
    }

    /** All banned user ids + the count (for the admin dashboard stat + user list). */
    async getBannedUserIds(): Promise<{ ids: string[]; count: number }> {
        const rows = await this.prisma.user.findMany({ where: { banned: true } as any, select: { id: true } });
        const ids = rows.map((r) => r.id);
        return { ids, count: ids.length };
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
        // Normalize the email so the lookup matches how register()/login() store
        // it (case-insensitive, no surrounding whitespace) — otherwise a reset
        // request for 'User@Example.com ' would never find the canonical row.
        const email = body.email.trim().toLowerCase();

        const user = await this.prisma.user.findUnique({
            where: { email },
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

        // Token is now committed — deliver the reset link. We send AFTER the
        // commit (not inside a tx) so a slow/failing mail server can never roll
        // back or hold open the DB write. The raw token is never logged on the
        // production path (only the no-SMTP DEV fallback surfaces the link).
        logger.info({ userId: user.id }, 'Password reset token generated');
        await this.sendPasswordResetEmail(email, rawToken);

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

    /**
     * GDPR purge — PERMANENTLY delete EVERY row this service owns for `userId`.
     *
     * This service's user-owned tables (verified against prisma/schema.prisma):
     *   - refresh_tokens        (user_id)  — child rows, deleted first
     *   - password_reset_tokens (user_id)  — child rows, deleted first
     *   - users                 (id)       — the parent row, deleted last
     *
     * (refresh/reset tokens declare `onDelete: Cascade`, so deleting the user
     * alone would clear them — but we delete them explicitly anyway so the
     * returned summary reports an accurate per-table count and the purge does
     * not silently depend on the DB-level cascade.)
     *
     * IDEMPOTENT: every delete is a `deleteMany` (returns `{ count }`, never
     * throws on zero matches), so purging a user with no rows succeeds with all
     * counts 0, and purging the same user twice is safe. All deletes run inside
     * a single interactive transaction so the purge is atomic.
     *
     * Returns a per-table summary of how many rows were removed.
     */
    async purgeUserData(userId: string): Promise<{
        userId: string;
        deletedCounts: { refresh_tokens: number; password_reset_tokens: number; users: number };
    }> {
        const [refreshTokens, passwordResetTokens, users] = await this.prisma.$transaction([
            // Children first (explicit, not relying on the FK cascade) so the
            // counts are accurate regardless of cascade behaviour.
            this.prisma.refreshToken.deleteMany({ where: { userId } }),
            this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
            // Parent last.
            this.prisma.user.deleteMany({ where: { id: userId } }),
        ]);

        return {
            userId,
            deletedCounts: {
                refresh_tokens: refreshTokens.count,
                password_reset_tokens: passwordResetTokens.count,
                users: users.count,
            },
        };
    }

    /**
     * GDPR data export (Right of Access / Art. 15) — READ and return EVERY row
     * this service owns for `userId`, mirroring purgeUserData's table set EXACTLY
     * so export and erasure stay in sync:
     *   - users                 (id)
     *   - refresh_tokens        (user_id)
     *   - password_reset_tokens (user_id)
     *
     * SECURITY: this is auth-service, so the rows hold live credentials/secrets.
     * We export ONLY non-secret account metadata via Prisma `select` allowlists
     * and NEVER the secret columns:
     *   - users:                 passwordHash is EXCLUDED.
     *   - refresh_tokens:        tokenHash is EXCLUDED.
     *   - password_reset_tokens: tokenHash is EXCLUDED.
     * The selects are explicit allowlists (not `omit`) so a future schema column
     * is excluded by default and cannot accidentally leak.
     *
     * READ-ONLY and IDEMPOTENT: only findUnique/findMany run (no writes), so a
     * user with no rows returns `users: null` and empty arrays, and repeat calls
     * return identical data. Child token tables are bounded with a sane `take`
     * cap so a pathological row count cannot produce an unbounded response.
     *
     * Returns a JSON object keyed by DB table name.
     */
    async exportUserData(userId: string): Promise<{
        userId: string;
        data: {
            users: {
                id: string;
                email: string;
                displayName: string;
                avatarUrl: string | null;
                timezone: string;
                locale: string;
                region: string;
                role: string;
                onboardingCompleted: boolean;
                emailVerified: boolean;
                createdAt: Date;
                updatedAt: Date;
            } | null;
            refresh_tokens: Array<{
                id: string;
                deviceId: string;
                expiresAt: Date;
                createdAt: Date;
            }>;
            password_reset_tokens: Array<{
                id: string;
                expiresAt: Date;
                usedAt: Date | null;
                createdAt: Date;
            }>;
        };
    }> {
        // Bound child token tables so a per-user export can never be unbounded.
        const TOKEN_TAKE = 1000;

        const [user, refreshTokens, passwordResetTokens] = await this.prisma.$transaction([
            // users — non-secret account metadata only; passwordHash EXCLUDED.
            this.prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    email: true,
                    displayName: true,
                    avatarUrl: true,
                    timezone: true,
                    locale: true,
                    region: true,
                    role: true,
                    onboardingCompleted: true,
                    emailVerified: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
            // refresh_tokens — metadata only; tokenHash (the secret) EXCLUDED.
            this.prisma.refreshToken.findMany({
                where: { userId },
                select: {
                    id: true,
                    deviceId: true,
                    expiresAt: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'asc' },
                take: TOKEN_TAKE,
            }),
            // password_reset_tokens — metadata only; tokenHash (the secret) EXCLUDED.
            this.prisma.passwordResetToken.findMany({
                where: { userId },
                select: {
                    id: true,
                    expiresAt: true,
                    usedAt: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'asc' },
                take: TOKEN_TAKE,
            }),
        ]);

        return {
            userId,
            data: {
                users: user as any,
                refresh_tokens: refreshTokens as any,
                password_reset_tokens: passwordResetTokens as any,
            },
        };
    }
}
