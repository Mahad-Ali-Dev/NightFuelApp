import { z } from 'zod';

// Registration only ever creates a plain USER. The professional roles (COACH,
// TRAINER, NUTRITIONIST) and ADMIN/SUPERADMIN are NOT self-assignable — they are
// granted out-of-band: ADMIN via a one-off DB seed, and the coach-family roles via
// the admin approval flow (apply → admin verifies → role promoted). This closes
// the "anyone can register as a COACH" hole.
const SelfAssignableRole = z.enum(['USER']).default('USER');

// Strong-password rule for NEW passwords (register + reset). Mirrors the mobile
// client's isStrongPassword check: at least 8 chars, one uppercase, one digit.
// NOTE: deliberately NOT applied to loginSchema.password so legacy/weaker
// existing passwords can still authenticate.
const strongPassword = z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a number');

export const registerSchema = z.object({
    email:       z.string().email(),
    password:    strongPassword,
    displayName: z.string().min(2),
    region:      z.string().length(2), // ISO 3166-1 alpha-2: 'us', 'gb', 'pk', etc.
    timezone:    z.string().optional().default('UTC'),
    locale:      z.string().optional().default('en-US'),
    role:        SelfAssignableRole,
    deviceId:    z.string().default('unknown'),
});

export const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
    deviceId: z.string().default('unknown'),
});

// refreshToken is OPTIONAL in the body: the mobile client still sends it in the
// body (reads it from the JSON response, stored in native SecureStore), while
// the web client now holds it ONLY in an httpOnly cookie and sends nothing in
// the body — the handler falls back to the nf_refresh cookie. Exactly one of the
// two sources must be present at runtime (enforced in the route handler), but
// the schema must allow the body to be absent so the cookie-only web path
// validates.
export const refreshTokenSchema = z.object({
    refreshToken: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
    email: z.string().email(),
});

export const resetPasswordSchema = z.object({
    token:       z.string().min(1),
    newPassword: strongPassword,
});

// ── Social sign-in ──────────────────────────────────────────────────────────
// The mobile client obtains the provider token natively (Google Sign-In SDK /
// Apple Authentication) and posts the raw token here for the backend to VERIFY.
// deviceId mirrors login/register so the issued refresh token is bound to a
// device (defaults to 'unknown' like the other flows).
export const googleOAuthSchema = z.object({
    idToken:  z.string().min(1),
    deviceId: z.string().default('unknown'),
});

export const appleOAuthSchema = z.object({
    identityToken: z.string().min(1),
    // Apple returns the user's name ONLY on the first authorization — the client
    // forwards it so we can seed displayName on account creation. Optional and
    // ignored on repeat sign-ins (the account already exists).
    fullName: z
        .object({
            givenName:  z.string().optional().nullable(),
            familyName: z.string().optional().nullable(),
        })
        .optional(),
    deviceId: z.string().default('unknown'),
});

// ── Email OTP (verify email at signup) ──────────────────────────────────────
// The code is exactly 6 numeric digits; store/compare only its hash server-side.
export const verifyOtpSchema = z.object({
    email:    z.string().email(),
    code:     z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
    deviceId: z.string().default('unknown'),
});

export const resendOtpSchema = z.object({
    email: z.string().email(),
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type RefreshTokenBody = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
export type GoogleOAuthBody = z.infer<typeof googleOAuthSchema>;
export type AppleOAuthBody = z.infer<typeof appleOAuthSchema>;
export type VerifyOtpBody = z.infer<typeof verifyOtpSchema>;
export type ResendOtpBody = z.infer<typeof resendOtpSchema>;
