import { PrismaClient, User } from './generated/prisma';
import { RedisEventBus } from '@nightfuel/events';
import {
    RegisterBody,
    LoginBody,
    ForgotPasswordBody,
    ResetPasswordBody,
    GoogleOAuthBody,
    AppleOAuthBody,
    VerifyOtpBody,
    ResendOtpBody,
} from './schemas';
import bcrypt from 'bcryptjs';
import { Channels } from '@nightfuel/types';
import jwt from 'jsonwebtoken';
import nodemailer, { Transporter } from 'nodemailer';
import { createLogger } from '@nightfuel/config';
import { randomUUID, randomBytes, randomInt, createHash, createHmac } from 'crypto';
import {
    OAuthIdentity,
    verifyGoogleIdToken,
    verifyAppleIdentityToken,
} from './oauth';

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

// ── Email OTP (verify-email-at-signup) tuning ───────────────────────────────
// A 6-digit numeric code, valid for 10 minutes. Only the SHA-256 hash of the
// code is ever stored. Up to 5 verify attempts before the code is invalidated
// (brute-force cap: 5 tries against 1,000,000 possibilities). Resend is throttled
// to one code per cooldown window so it can't be used to spam or enumerate.
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_MS = 30 * 1000;
const OTP_PURPOSE_REGISTER = 'REGISTER';

// Generic message returned by resend-otp regardless of whether the email exists
// or is already verified — anti-enumeration, mirroring the forgot-password and
// register generic-response style.
const RESEND_OTP_MESSAGE = 'If an account needs verification, a new code has been sent';

// Generic error thrown when an OTP verify fails for ANY reason (no such pending
// code / expired / wrong code / too many attempts). A single opaque message
// prevents an attacker from distinguishing "email not found" from "wrong code".
const OTP_INVALID_MESSAGE = 'Invalid or expired code';

// Allowlisted login rejections for OAuth-only accounts and unverified emails.
// These are surfaced verbatim so the mobile client can branch (route to the
// verify screen on EMAIL_NOT_VERIFIED). They MUST also appear in routes.ts
// ALLOWED or they collapse to the generic fallback.
const EMAIL_NOT_VERIFIED_MESSAGE = 'EMAIL_NOT_VERIFIED';
const OAUTH_ONLY_LOGIN_MESSAGE = 'Use social sign-in for this account';

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

    /**
     * Hash a low-entropy OTP code for storage/comparison.
     *
     * Unlike the high-entropy refresh/reset tokens (hashToken → plain SHA-256), a
     * 6-digit code has only 1,000,000 possibilities, so an UNSALTED digest is
     * trivially reversible from a DB read via a precomputed table. We bind the
     * code to a server-side secret (JWT_SECRET — never stored alongside the code)
     * with HMAC-SHA256, so a leaked email_otps row cannot be reversed offline.
     * The SAME function is used to store (issueEmailOtp) and to verify (verifyOtp).
     */
    private hashOtpCode(code: string): string {
        return createHmac('sha256', this.config.JWT_SECRET).update(code).digest('hex');
    }

    /** Branded, email-client-safe HTML for the OTP verification email. */
    private buildOtpEmailHtml(code: string): string {
        return (
            `<div style="margin:0;padding:0;background:#0A0C10;">` +
            `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0C10;padding:32px 0;"><tr><td align="center">` +
            `<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:480px;background:#12151B;border:1px solid #1E232C;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">` +
            `<tr><td style="padding:28px 32px 4px 32px;" align="center"><span style="font-size:22px;font-weight:800;letter-spacing:2px;color:#C2F03C;">ZEITRA</span></td></tr>` +
            `<tr><td style="padding:10px 32px 0 32px;" align="center"><h1 style="margin:0;font-size:20px;line-height:28px;color:#FFFFFF;font-weight:700;">Verify your email</h1></td></tr>` +
            `<tr><td style="padding:12px 32px 0 32px;" align="center"><p style="margin:0;font-size:14px;line-height:22px;color:#9BA3AF;">Enter this code in the app to finish creating your account.</p></td></tr>` +
            `<tr><td style="padding:24px 32px 8px 32px;" align="center"><div style="display:inline-block;background:#0A0C10;border:1px solid #C2F03C;border-radius:12px;padding:16px 24px;"><span style="font-size:34px;font-weight:800;letter-spacing:10px;color:#C2F03C;font-family:'Courier New',Courier,monospace;">${code}</span></div></td></tr>` +
            `<tr><td style="padding:8px 32px 24px 32px;" align="center"><p style="margin:0;font-size:12px;line-height:18px;color:#6B7280;">This code expires in ${OTP_TTL_MINUTES} minutes.</p></td></tr>` +
            `<tr><td style="padding:0 32px;"><div style="height:1px;background:#1E232C;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>` +
            `<tr><td style="padding:20px 32px 28px 32px;" align="center"><p style="margin:0;font-size:12px;line-height:18px;color:#6B7280;">If you didn't create a Zeitra account, you can safely ignore this email.</p></td></tr>` +
            `</table>` +
            `<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:480px;"><tr><td align="center" style="padding:16px 32px;"><p style="margin:0;font-size:11px;line-height:16px;color:#4B5563;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">&copy; Zeitra &middot; Nutrition &amp; fitness for every schedule</p></td></tr></table>` +
            `</td></tr></table></div>`
        );
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
     * Deliver (or, in dev, log) a 6-digit email-verification OTP `code`.
     *
     * Same delivery contract as sendPasswordResetEmail: when SMTP is configured
     * we email the code and NEVER log it; when SMTP is unset we log the code
     * under an explicit DEV marker (the only path that surfaces the raw code,
     * and it cannot run in production where SMTP_* is set). Best-effort: a mail
     * failure is logged, not rethrown, so verify/resend keep their generic
     * anti-enumeration responses regardless of delivery outcome.
     */
    private async sendOtpEmail(email: string, code: string): Promise<void> {
        if (!this.smtpConfigured()) {
            // DEV FALLBACK — no SMTP configured. Log the code so the verify flow
            // can be exercised without mail credentials. ONLY path that surfaces
            // the raw code; cannot trigger in production (SMTP_* must be set).
            // OWNER: configure SMTP_* to switch to real email delivery.
            logger.warn(
                { code },
                '[DEV] SMTP not configured — email verification code (configure SMTP_* for real email delivery)',
            );
            return;
        }

        try {
            await this.getMailTransport().sendMail({
                to: email,
                from: this.config.smtp?.from || 'no-reply@zeitra.app',
                subject: 'Your Zeitra verification code',
                text:
                    `ZEITRA — Verify your email\n\n` +
                    `Your verification code is: ${code}\n\n` +
                    `Enter it in the app to finish creating your account. ` +
                    `This code expires in ${OTP_TTL_MINUTES} minutes.\n\n` +
                    `If you didn't create a Zeitra account, you can safely ignore this email.`,
                html: this.buildOtpEmailHtml(code),
            });
            // Never log the raw code on the production path.
            logger.info('Email verification code sent');
        } catch (err) {
            logger.error({ err }, 'Failed to send email verification code');
        }
    }

    /**
     * Deliver (or, in dev, log) the "you already have an account" notice.
     *
     * Sent when someone tries to REGISTER (or resend a signup code) with an
     * email that already belongs to a VERIFIED account. The API response stays
     * the generic anti-enumeration message — only the inbox owner learns the
     * account exists, which is information they already have. Without this,
     * an existing user who taps "sign up" instead of "log in" lands on the
     * verify screen and waits forever for a code that will never come.
     */
    private async sendAccountExistsEmail(email: string): Promise<void> {
        if (!this.smtpConfigured()) {
            logger.warn(
                { email },
                '[DEV] SMTP not configured — would send "account exists, please log in" notice',
            );
            return;
        }
        try {
            await this.getMailTransport().sendMail({
                to: email,
                from: this.config.smtp?.from || 'no-reply@zeitra.app',
                subject: 'You already have a Zeitra account',
                text:
                    `Someone (probably you) tried to sign up for Zeitra with this email — ` +
                    `but you already have an account.\n\n` +
                    `Just open Zeitra and log in with this email. Forgot your password? ` +
                    `Use "Forgot password" on the login screen.\n\n` +
                    `If this wasn't you, you can safely ignore this email — no new account was created.`,
                html:
                    `<div style="margin:0;padding:0;background:#0A0C10;">` +
                    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0C10;padding:32px 0;"><tr><td align="center">` +
                    `<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:480px;background:#12151B;border:1px solid #1E232C;border-radius:16px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">` +
                    `<tr><td style="padding:28px 32px 4px 32px;" align="center"><span style="font-size:22px;font-weight:800;letter-spacing:2px;color:#C2F03C;">ZEITRA</span></td></tr>` +
                    `<tr><td style="padding:10px 32px 0 32px;" align="center"><h1 style="margin:0;font-size:20px;line-height:28px;color:#FFFFFF;font-weight:700;">You already have an account</h1></td></tr>` +
                    `<tr><td style="padding:12px 32px 0 32px;" align="center"><p style="margin:0;font-size:14px;line-height:22px;color:#9BA3AF;">Someone (probably you) tried to sign up with this email — but it's already registered. Just open Zeitra and <strong style="color:#FFFFFF;">log in</strong> instead.</p></td></tr>` +
                    `<tr><td style="padding:20px 32px 8px 32px;" align="center"><p style="margin:0;font-size:13px;line-height:20px;color:#9BA3AF;">Forgot your password? Use <strong style="color:#C2F03C;">Forgot password</strong> on the login screen.</p></td></tr>` +
                    `<tr><td style="padding:16px 32px 28px 32px;" align="center"><p style="margin:0;font-size:12px;line-height:18px;color:#6B7280;">If this wasn't you, you can safely ignore this email — no new account was created.</p></td></tr>` +
                    `</table></td></tr></table></div>`,
            });
            logger.info('Account-exists notice sent');
        } catch (err) {
            logger.error({ err }, 'Failed to send account-exists notice');
        }
    }

    /**
     * Generate, persist (hashed), and email a fresh OTP for `userId`/`email`.
     *
     * Enforces a resend cooldown: if a still-live code for this (email, purpose)
     * was issued within OTP_RESEND_COOLDOWN_MS, we DON'T issue a new one (returns
     * false) so the endpoint can't be used to spam mail or hammer the DB. On
     * issue, any prior pending codes for the (email, purpose) are invalidated so
     * only the newest code works. Only the SHA-256 hash of the code is stored.
     *
     * Returns true when a new code was issued+sent, false when suppressed by the
     * cooldown. Callers keep their generic response either way.
     */
    private async issueEmailOtp(
        userId: string | null,
        email: string,
        purpose: string,
    ): Promise<boolean> {
        const now = Date.now();

        // Cooldown: was a code for this (email, purpose) issued very recently?
        const recent = await this.prisma.emailOtp.findFirst({
            where: { email, purpose, consumedAt: null },
            orderBy: { createdAt: 'desc' },
        });
        if (recent && now - recent.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
            return false;
        }

        // Invalidate prior pending codes so only the newest is valid.
        await this.prisma.emailOtp.updateMany({
            where: { email, purpose, consumedAt: null },
            data: { consumedAt: new Date() },
        });

        // 6-digit numeric code with crypto-strong entropy (randomInt is uniform,
        // unlike Math.random). Zero-padded to always be exactly 6 digits.
        const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
        const codeHash = this.hashOtpCode(code);
        const expiresAt = new Date(now + OTP_TTL_MINUTES * 60 * 1000);

        await this.prisma.emailOtp.create({
            data: { email, userId: userId ?? undefined, codeHash, purpose, expiresAt },
        });

        await this.sendOtpEmail(email, code);
        return true;
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
            // The API response stays generic (anti-enumeration), but the inbox
            // owner gets a helpful nudge instead of a verify screen that never
            // receives a code: verified accounts are told to log in; a stale
            // UNVERIFIED signup gets a fresh code so they can finish.
            if (existingUser.emailVerified) {
                await this.sendAccountExistsEmail(email);
            } else {
                await this.issueEmailOtp(existingUser.id, email, OTP_PURPOSE_REGISTER);
            }
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
                // New email signups start UNVERIFIED — the user must confirm the
                // emailed OTP (verify-otp) before they can log in. login() rejects
                // an unverified account with EMAIL_NOT_VERIFIED.
                emailVerified: false,
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

        // Issue + email the verification OTP (best-effort delivery, like the
        // reset email). The generic REGISTER_MESSAGE is still returned WITHOUT
        // tokens — the client routes to the verify screen with the email and the
        // user logs in only after entering the code.
        await this.issueEmailOtp(user.id, email, OTP_PURPOSE_REGISTER);

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

        // OAuth-only accounts have no local password (passwordHash null). Still
        // spend a bcrypt.compare against the dummy hash so the timing matches a
        // password account, then reject with the allowlisted social-only message
        // so the client can steer the user to Google/Apple sign-in.
        if (!user.passwordHash) {
            await bcrypt.compare(body.password, DUMMY_PASSWORD_HASH);
            throw new Error(OAUTH_ONLY_LOGIN_MESSAGE);
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

        // Email must be verified before a password login can mint tokens. Checked
        // AFTER the password so a wrong password can't reveal verification state.
        // The allowlisted EMAIL_NOT_VERIFIED lets the client route to the verify
        // screen and trigger a resend. Success clears the failure counter first
        // so a legitimate unverified user isn't penalised with a lockout.
        if (!user.emailVerified) {
            this.clearLoginFailures(lockoutKey);
            throw new Error(EMAIL_NOT_VERIFIED_MESSAGE);
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

    /**
     * Verify a signup email OTP. On success: mark the code consumed, flip the
     * user's emailVerified=true, and return the SAME { user, accessToken,
     * refreshToken } shape as login() so the client logs the user straight in.
     *
     * ANTI-ENUMERATION + BRUTE-FORCE: every failure (no pending code / expired /
     * wrong code / too many attempts / no matching user) throws the SINGLE
     * opaque OTP_INVALID_MESSAGE, so an attacker can't distinguish "email not
     * found" from "wrong code". A wrong code increments the attempt counter and,
     * once OTP_MAX_ATTEMPTS is exceeded, the code is invalidated (consumed) so it
     * can't be ground down further.
     */
    async verifyOtp(body: VerifyOtpBody): Promise<{ user: SafeUser; accessToken: string; refreshToken: string }> {
        const email = body.email.trim().toLowerCase();
        // Hash the submitted code up-front so the no-pending-code path and the
        // wrong-code path pay the same HMAC cost — removes a timing side-channel
        // that would otherwise reveal whether a pending OTP exists for this email.
        const submittedHash = this.hashOtpCode(body.code);

        // Newest still-pending REGISTER code for this email.
        const otp = await this.prisma.emailOtp.findFirst({
            where: { email, purpose: OTP_PURPOSE_REGISTER, consumedAt: null },
            orderBy: { createdAt: 'desc' },
        });

        // No pending code, or it already expired → opaque failure. (Expiry is
        // treated exactly like "no code" so timing/response don't leak state.)
        if (!otp || otp.expiresAt < new Date()) {
            throw new Error(OTP_INVALID_MESSAGE);
        }

        // Attempt cap already reached (belt-and-suspenders — we also consume on
        // exceed below, but a concurrent request could land here).
        if (otp.attempts >= OTP_MAX_ATTEMPTS) {
            await this.prisma.emailOtp.update({
                where: { id: otp.id },
                data: { consumedAt: new Date() },
            });
            throw new Error(OTP_INVALID_MESSAGE);
        }

        const matches = otp.codeHash === submittedHash;
        if (!matches) {
            // Wrong code: increment attempts; invalidate once the cap is hit.
            const attempts = otp.attempts + 1;
            await this.prisma.emailOtp.update({
                where: { id: otp.id },
                data: {
                    attempts,
                    consumedAt: attempts >= OTP_MAX_ATTEMPTS ? new Date() : null,
                },
            });
            throw new Error(OTP_INVALID_MESSAGE);
        }

        // Correct code. Resolve the account (prefer the FK captured at issue time,
        // fall back to email). A missing/banned user is still an opaque failure.
        const user = otp.userId
            ? await this.prisma.user.findUnique({ where: { id: otp.userId } })
            : await this.prisma.user.findUnique({ where: { email } });
        if (!user) {
            throw new Error(OTP_INVALID_MESSAGE);
        }
        if ((user as any).banned) {
            // Don't mint tokens for a banned account; opaque to avoid leaking ban state.
            throw new Error(OTP_INVALID_MESSAGE);
        }

        // Consume the code and flip verification atomically.
        await this.prisma.$transaction([
            this.prisma.emailOtp.update({
                where: { id: otp.id },
                data: { consumedAt: new Date() },
            }),
            this.prisma.user.update({
                where: { id: user.id },
                data: { emailVerified: true },
            }),
        ]);

        const verifiedUser = { ...user, emailVerified: true };
        const { accessToken, refreshToken } = await this.generateTokens(verifiedUser, body.deviceId);
        const { passwordHash, ...safeUser } = verifiedUser;
        return { user: safeUser, accessToken, refreshToken };
    }

    /**
     * Resend a signup verification code. ALWAYS resolves with the same generic
     * message (never reveals whether the email exists or is already verified) —
     * anti-enumeration, same timing shape as forgot-password. A new code is only
     * actually issued when the account exists and is still unverified, and the
     * resend cooldown inside issueEmailOtp throttles repeated calls.
     */
    async resendOtp(body: ResendOtpBody): Promise<{ message: string }> {
        const email = body.email.trim().toLowerCase();

        const user = await this.prisma.user.findUnique({ where: { email } });
        // (Re)issue for a real, still-unverified account. An already-VERIFIED
        // account gets the "you already have an account — log in" notice
        // instead of silence (the response stays generic either way).
        if (user && !user.emailVerified) {
            await this.issueEmailOtp(user.id, email, OTP_PURPOSE_REGISTER);
        } else if (user && user.emailVerified) {
            await this.sendAccountExistsEmail(email);
        }

        return { message: RESEND_OTP_MESSAGE };
    }

    /**
     * Google sign-in. Verifies the ID token (google-auth-library), then
     * find-or-creates/links the local account and issues tokens. Returns the
     * SAME shape as login().
     */
    async googleSignIn(body: GoogleOAuthBody): Promise<{ user: SafeUser; accessToken: string; refreshToken: string }> {
        const identity = await verifyGoogleIdToken(body.idToken);
        return this.signInWithOAuthIdentity('google', identity, body.deviceId);
    }

    /**
     * Apple sign-in. Verifies the identity token against Apple's JWKS, then
     * find-or-creates/links the local account and issues tokens. Apple returns
     * email/name only on the FIRST authorization; `fullName` (when present) seeds
     * displayName on account creation. Returns the SAME shape as login().
     */
    async appleSignIn(body: AppleOAuthBody): Promise<{ user: SafeUser; accessToken: string; refreshToken: string }> {
        const identity = await verifyAppleIdentityToken(body.identityToken);

        // Apple only sends the name on first auth — prefer the client-forwarded
        // fullName for the display name when the token itself carried none.
        if (!identity.name && body.fullName) {
            const parts = [body.fullName.givenName, body.fullName.familyName]
                .map((p) => (p ?? '').trim())
                .filter(Boolean);
            if (parts.length > 0) identity.name = parts.join(' ');
        }

        return this.signInWithOAuthIdentity('apple', identity, body.deviceId);
    }

    /**
     * Shared find-or-create/link for a verified provider identity:
     *   (a) OAuthAccount (provider, sub) exists  -> load that user.
     *   (b) else a User with this VERIFIED email -> link a new OAuthAccount and
     *       set emailVerified=true (safe: the provider verified the email).
     *   (c) else create a new User (emailVerified=true, passwordHash=null,
     *       displayName from provider name or email local-part), publish the SAME
     *       UserRegistered event register() publishes (so user-service provisions
     *       the profile), then link the OAuthAccount — all in one transaction so a
     *       first-time user is provisioned exactly once.
     *
     * Then issues tokens (login() shape). Banned accounts are rejected.
     */
    private async signInWithOAuthIdentity(
        provider: 'google' | 'apple',
        identity: OAuthIdentity,
        deviceId: string,
    ): Promise<{ user: SafeUser; accessToken: string; refreshToken: string }> {
        // (a) Existing link by (provider, sub) — the stable path for repeat
        // sign-ins (Apple sends no email after the first auth, so this is the
        // ONLY reliable key then).
        const existingLink = await this.prisma.oAuthAccount.findUnique({
            where: {
                provider_providerAccountId: {
                    provider,
                    providerAccountId: identity.sub,
                },
            },
            include: { user: true },
        });

        let user: User | null = existingLink?.user ?? null;
        let created = false;

        // Only a PROVIDER-VERIFIED email may find/link/create an account. Google's
        // verifier already rejects unverified emails; Apple returns email +
        // email_verified WITHOUT rejecting, so gate here so an unverified provider
        // email can never claim, link to, or spoof-create an arbitrary address.
        const providerEmail = identity.emailVerified ? identity.email : null;

        if (!user && providerEmail) {
            // (b) Link to an existing local account that owns this verified email.
            const byEmail = await this.prisma.user.findUnique({
                where: { email: providerEmail },
            });
            if (byEmail) {
                await this.prisma.oAuthAccount.create({
                    data: {
                        userId: byEmail.id,
                        provider,
                        providerAccountId: identity.sub,
                    },
                });
                // If the account was ALREADY verified, its owner proved inbox
                // control earlier (our OTP only reaches the real inbox), so the
                // account and any password it set are trusted — keep them.
                // If it was NOT yet verified, the row is unproven and its password
                // may have been pre-seeded by an attacker who registered the
                // victim's email first. The provider has now proven inbox
                // ownership, so we verify the account AND null the unproven
                // passwordHash so a pre-seeded password can't survive the link
                // (closes the pre-registration account-takeover).
                user = byEmail.emailVerified
                    ? byEmail
                    : await this.prisma.user.update({
                          where: { id: byEmail.id },
                          data: { emailVerified: true, passwordHash: null },
                      });
            }
        }

        if (!user) {
            // (c) Brand-new user. Provider-verified email (when present) means we
            // create the account already verified with no local password. Apple
            // repeat-signins with no email shouldn't reach here (they match by sub
            // in (a)); a first Apple auth always carries the email.
            const email = providerEmail
                ? providerEmail
                : `${identity.sub}@${provider}.oauth.local`;
            const displayName = this.deriveDisplayName(identity.name, email);

            // Create user + link in ONE transaction so a partial failure can't
            // leave a user without its OAuth link (or vice-versa).
            const newUser = await this.prisma.$transaction(async (tx) => {
                const u = await tx.user.create({
                    data: {
                        email,
                        passwordHash: null,
                        displayName,
                        // OAuth accounts have no region from the provider; default
                        // to 'us' (2-char, matches the schema's region constraint).
                        region: 'us',
                        timezone: 'UTC',
                        locale: 'en-US',
                        emailVerified: true,
                        role: 'USER' as any,
                    },
                });
                await tx.oAuthAccount.create({
                    data: {
                        userId: u.id,
                        provider,
                        providerAccountId: identity.sub,
                    },
                });
                return u;
            });

            user = newUser;
            created = true;

            // Publish the SAME user.registered event register() publishes so
            // user-service provisions the profile exactly once (first sign-in only).
            await this.eventBus.publish(Channels.Auth.UserRegistered, {
                eventId: randomUUID(),
                eventType: 'user.registered',
                producedAt: new Date().toISOString(),
                producerService: 'auth-service',
                correlationId: randomUUID(),
                userId: newUser.id,
                payload: {
                    email: newUser.email,
                    displayName: newUser.displayName,
                    role: newUser.role,
                    timezone: newUser.timezone,
                    region: newUser.region,
                },
            });
        }

        // Banned accounts cannot obtain tokens via any path.
        if ((user as any).banned) {
            throw new Error('Account disabled');
        }

        logger.info({ provider, created }, 'OAuth sign-in completed');

        const { accessToken, refreshToken } = await this.generateTokens(user, deviceId);
        const { passwordHash, ...safeUser } = user;
        return { user: safeUser, accessToken, refreshToken };
    }

    /** Best display name from the provider name, else the email local-part. */
    private deriveDisplayName(name: string | null, email: string): string {
        const trimmed = (name ?? '').trim();
        if (trimmed.length >= 2) return trimmed;
        const local = email.split('@')[0] || 'user';
        // displayName has a min length of 2 elsewhere — pad ultra-short locals.
        return local.length >= 2 ? local : `${local}_user`;
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
     *   - oauth_accounts        (user_id)  — child rows, deleted first
     *   - email_otps            (user_id)  — child rows, deleted first
     *   - users                 (id)       — the parent row, deleted last
     *
     * (all child tables declare `onDelete: Cascade`, so deleting the user alone
     * would clear them — but we delete them explicitly anyway so the returned
     * summary reports an accurate per-table count and the purge does not silently
     * depend on the DB-level cascade.)
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
        deletedCounts: {
            refresh_tokens: number;
            password_reset_tokens: number;
            oauth_accounts: number;
            email_otps: number;
            users: number;
        };
    }> {
        const [refreshTokens, passwordResetTokens, oauthAccounts, emailOtps, users] =
            await this.prisma.$transaction([
                // Children first (explicit, not relying on the FK cascade) so the
                // counts are accurate regardless of cascade behaviour.
                this.prisma.refreshToken.deleteMany({ where: { userId } }),
                this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
                this.prisma.oAuthAccount.deleteMany({ where: { userId } }),
                this.prisma.emailOtp.deleteMany({ where: { userId } }),
                // Parent last.
                this.prisma.user.deleteMany({ where: { id: userId } }),
            ]);

        return {
            userId,
            deletedCounts: {
                refresh_tokens: refreshTokens.count,
                password_reset_tokens: passwordResetTokens.count,
                oauth_accounts: oauthAccounts.count,
                email_otps: emailOtps.count,
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
     *   - oauth_accounts        (user_id)
     *   - email_otps            (user_id)
     *
     * SECURITY: this is auth-service, so the rows hold live credentials/secrets.
     * We export ONLY non-secret account metadata via Prisma `select` allowlists
     * and NEVER the secret columns:
     *   - users:                 passwordHash is EXCLUDED.
     *   - refresh_tokens:        tokenHash is EXCLUDED.
     *   - password_reset_tokens: tokenHash is EXCLUDED.
     *   - oauth_accounts:        provider + createdAt only (providerAccountId,
     *                            the raw provider subject id, is EXCLUDED).
     *   - email_otps:            purpose/timestamps only; codeHash is EXCLUDED.
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
            oauth_accounts: Array<{
                id: string;
                provider: string;
                createdAt: Date;
            }>;
            email_otps: Array<{
                id: string;
                purpose: string;
                expiresAt: Date;
                consumedAt: Date | null;
                attempts: number;
                createdAt: Date;
            }>;
        };
    }> {
        // Bound child token tables so a per-user export can never be unbounded.
        const TOKEN_TAKE = 1000;

        const [user, refreshTokens, passwordResetTokens, oauthAccounts, emailOtps] =
            await this.prisma.$transaction([
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
            // oauth_accounts — provider + createdAt only; the raw provider subject
            // id (providerAccountId) is EXCLUDED (treated as sensitive).
            this.prisma.oAuthAccount.findMany({
                where: { userId },
                select: {
                    id: true,
                    provider: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'asc' },
                take: TOKEN_TAKE,
            }),
            // email_otps — purpose/timestamps only; codeHash (the secret) EXCLUDED.
            this.prisma.emailOtp.findMany({
                where: { userId },
                select: {
                    id: true,
                    purpose: true,
                    expiresAt: true,
                    consumedAt: true,
                    attempts: true,
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
                oauth_accounts: oauthAccounts as any,
                email_otps: emailOtps as any,
            },
        };
    }
}
