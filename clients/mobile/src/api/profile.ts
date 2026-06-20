import { apiClient } from './client';
import { User } from '@/store/authStore';

export interface UserProfile extends User {
    // The user-service profile row carries displayName/avatarUrl/timezone (see
    // services/user-service/prisma/schema.prisma → model UserProfile). There is
    // NO aboutMe/occupation column on that row — the editor used to send them and
    // falsely claim they saved, so they are intentionally absent here.
    timezone?: string;
    avatarUrl: string | null;
    preferences?: UserPreferences;
    status?: UserStatus;
}

// Shape PUT /v1/users/me actually accepts (server: updateProfileSchema in
// services/user-service/src/schemas.ts). Deliberately decoupled from the GET
// response (UserProfile, whose `name` is the authStore mirror of the server's
// `displayName`): the server reads `displayName`, so the editor must send that
// key — sending `name` silently no-ops.
export interface UpdateProfileInput {
    displayName?: string;
    avatarUrl?: string | null;
    dateOfBirth?: string | null;
    heightCm?: number | null;
    weightKg?: number | null;
    biologicalSex?: 'MALE' | 'FEMALE' | 'OTHER' | 'PREFER_NOT_TO_SAY' | null;
    timezone?: string;
    region?: 'us' | 'eu' | 'ap';
}

// Mirrors the columns GET /v1/users/me/preferences actually returns
// (services/user-service/prisma/schema.prisma → model UserPreferences). Fields
// the client used to read but that have NO backing column — dietaryType (server:
// dietaryPreference), wakeTime/sleepTime/workStartTime/workEndTime (server:
// sleepWindowStart/sleepWindowEnd only), sleepTargetHours, and
// dislikedIngredients/medications/supplements — were removed so the screen can't
// claim to persist something the server drops.
export interface UserPreferences {
    dietaryPreference: string;
    sleepWindowStart: string | null;
    sleepWindowEnd: string | null;
    allergies: string[];
    healthConditions: string[];
}

export interface UserStatus {
    fatigueScore: number;
    adherenceScore: number;
    // Optional: no service currently returns a circadian phase on the status
    // row (the user-service status carries circadianPeakTime/circadianLowTime,
    // not a phase). Leave it undefined when absent so the UI's honest-empty
    // fallback ('—') renders instead of a fabricated 'WAKE' for everyone.
    circadianPhase?: 'WAKE' | 'SLEEP' | 'WIND_DOWN';
    lastUpdated: string;
}

export const getMyProfile = async (): Promise<UserProfile> => {
    const { data } = await apiClient.get('/v1/users/me');
    return data;
};

export const updateProfile = async (updates: UpdateProfileInput): Promise<UserProfile> => {
    const { data } = await apiClient.put('/v1/users/me', updates);
    return data;
};

export const getPreferences = async (): Promise<UserPreferences> => {
    const { data } = await apiClient.get('/v1/users/me/preferences');
    return data;
};

export const updatePreferences = async (updates: Partial<UserPreferences>): Promise<UserPreferences> => {
    const { data } = await apiClient.put('/v1/users/me/preferences', updates);
    return data;
};

export const getStatus = async (): Promise<UserStatus> => {
    // Backend uses adherenceRate / circadianPeakTime / updatedAt
    const { data } = await apiClient.get<any>('/v1/users/me/status');
    return {
        fatigueScore: data.fatigueScore ?? 0,
        adherenceScore: data.adherenceScore ?? data.adherenceRate ?? 0,
        // Pass through only when the backend actually provides a phase. Do NOT
        // fabricate 'WAKE' — no service returns this field, so the old default
        // hard-stuck the Profile "CIRCADIAN PHASE" card on 'WAKE' for everyone.
        // Left undefined, profile.tsx's `?? '—'` honest-empty fallback renders.
        circadianPhase: data.circadianPhase,
        lastUpdated: data.lastUpdated ?? data.updatedAt ?? '',
    };
};

export const getPublicProfile = async (userId: string): Promise<Partial<UserProfile>> => {
    const { data } = await apiClient.get(`/v1/users/public/${userId}`);
    return data;
};
