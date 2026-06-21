import { z } from 'zod';

// Roles a user can self-assign at registration. Admin/Superadmin are system-assigned only.
const SelfAssignableRole = z.enum(['USER', 'COACH', 'TRAINER', 'NUTRITIONIST']).default('USER');

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

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type RefreshTokenBody = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
