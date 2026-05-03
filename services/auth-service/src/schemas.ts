import { z } from 'zod';

// Roles a user can self-assign at registration. Admin/Superadmin are system-assigned only.
const SelfAssignableRole = z.enum(['USER', 'COACH', 'TRAINER', 'NUTRITIONIST']).default('USER');

export const registerSchema = z.object({
    email:       z.string().email(),
    password:    z.string().min(8),
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

export const refreshTokenSchema = z.object({
    refreshToken: z.string(),
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type RefreshTokenBody = z.infer<typeof refreshTokenSchema>;
